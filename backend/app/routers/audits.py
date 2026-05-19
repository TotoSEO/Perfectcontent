import re
from uuid import UUID
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Audit
from app.schemas.audit import AuditCreateIn, AuditListItem, AuditOut

router = APIRouter(dependencies=[Depends(require_session)])


@router.post("", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
async def create_audit(payload: AuditCreateIn, db: AsyncSession = Depends(get_db)) -> Audit:
    audit = Audit(
        name=payload.name,
        folder_id=payload.folder_id,
        source_filename=payload.source_filename,
        crawl_date=payload.crawl_date,
        url_count=payload.url_count,
        score=payload.score,
        summary=payload.summary,
        issues=payload.issues,
        notes=payload.notes,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(audit)
    return audit


@router.get("", response_model=list[AuditListItem])
async def list_audits(db: AsyncSession = Depends(get_db)) -> list[AuditListItem]:
    rows = (
        await db.execute(select(Audit).order_by(Audit.created_at.desc()))
    ).scalars().all()
    return [
        AuditListItem(
            id=a.id,
            name=a.name,
            url_count=a.url_count,
            score=float(a.score) if a.score is not None else None,
            audit_type=(a.summary or {}).get("audit_type", "classic") if isinstance(a.summary, dict) else "classic",
            created_at=a.created_at,
        )
        for a in rows
    ]


@router.get("/{audit_id}", response_model=AuditOut)
async def get_audit(audit_id: UUID, db: AsyncSession = Depends(get_db)) -> Audit:
    audit = await db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit not found")
    return audit


@router.delete("/{audit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audit(audit_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    audit = await db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit not found")
    await db.delete(audit)
    await db.commit()


# =========================================================================
# Advanced audit support: site-resources fetch + AI priority summary
# =========================================================================


class SiteResourcesIn(BaseModel):
    """Input for the site-resources fetch.

    The frontend passes the site origin (https://example.com) inferred from
    the first URL of the interne_html.csv export. We then fetch robots.txt,
    detect a sitemap reference, expand the sitemap to count URLs, and check
    for the optional llms.txt at the root.
    """
    origin: str


class RobotsTxtInfo(BaseModel):
    fetched: bool
    size_bytes: int | None = None
    lines: int | None = None
    has_sitemap_ref: bool = False
    user_agents: int = 0
    disallow_count: int = 0
    allow_count: int = 0
    raw_preview: str | None = None
    # IA-crawler declarations parsed out of robots.txt. Lower-cased bot
    # names, deduplicated. "Declared" = an explicit "User-agent: <bot>"
    # section exists. "Blocked" = that section contains "Disallow: /".
    # "Allowed" = explicit Allow: / on that bot (the desired state for GEO).
    ia_bots_declared: list[str] = []
    ia_bots_blocked: list[str] = []
    ia_bots_allowed: list[str] = []


class SitemapInfo(BaseModel):
    fetched: bool
    url_count: int | None = None
    nested_count: int = 0
    duplicates: int = 0
    reference_in_robots: bool = False


class LlmsTxtInfo(BaseModel):
    fetched: bool
    size_bytes: int | None = None
    lines: int | None = None


class StructuredDataInfo(BaseModel):
    # Result of scraping the homepage HTML for <script type="application/ld+json">.
    homepage_fetched: bool
    blocks_count: int = 0
    schemas_found: list[str] = []  # @type values, deduplicated, e.g. ["Organization", "WebSite"]
    raw_preview: str | None = None


class HeadersSampleInfo(BaseModel):
    sample_size: int = 0
    with_etag: int = 0
    with_last_modified: int = 0


class SiteResourcesOut(BaseModel):
    origin: str
    robots_txt: RobotsTxtInfo
    sitemap_xml: SitemapInfo
    llms_txt: LlmsTxtInfo
    structured_data: StructuredDataInfo = StructuredDataInfo(homepage_fetched=False)
    headers_sample: HeadersSampleInfo = HeadersSampleInfo()


def _normalise_origin(value: str) -> str:
    v = value.strip().rstrip("/")
    if not v:
        raise HTTPException(400, "origin is empty")
    if not v.startswith(("http://", "https://")):
        v = f"https://{v}"
    parsed = urlparse(v)
    if not parsed.netloc:
        raise HTTPException(400, "invalid origin")
    # Restrict to http/https — never let the caller force file://, ftp://, etc.
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "only http/https origins are allowed")
    return f"{parsed.scheme}://{parsed.netloc}"


def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower() if "}" in tag else tag.lower()


async def _expand_sitemap(client: httpx.AsyncClient, url: str, depth: int = 0, max_depth: int = 3, cap: int = 50000) -> tuple[list[str], int]:
    """Return (flat url list, nested sitemap count). Capped to avoid OOM."""
    if depth > max_depth:
        return [], 0
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
        content = r.content
    except (httpx.HTTPError, httpx.HTTPStatusError):
        return [], 0
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return [], 0
    tag = _localname(root.tag)
    if tag == "sitemapindex":
        flat: list[str] = []
        nested = 0
        for loc in root.iter():
            if _localname(loc.tag) != "loc":
                continue
            child_url = (loc.text or "").strip()
            if child_url:
                nested += 1
                child_flat, child_nested = await _expand_sitemap(client, child_url, depth=depth + 1, max_depth=max_depth, cap=cap)
                flat.extend(child_flat)
                nested += child_nested
                if len(flat) >= cap:
                    break
        return flat[:cap], nested
    if tag == "urlset":
        urls: list[str] = []
        for loc in root.iter():
            if _localname(loc.tag) != "loc":
                continue
            u = (loc.text or "").strip()
            if u:
                urls.append(u)
                if len(urls) >= cap:
                    break
        return urls, 0
    return [], 0


# Bots IA we explicitly look for in robots.txt. Mirrors the audit standard
# from agencies (datashake, semrush…): every name lowercased, stable order.
_IA_BOTS = [
    "gptbot",            # OpenAI training crawler (ChatGPT)
    "chatgpt-user",      # ChatGPT browse-with-bing real-time fetches
    "ccbot",             # Common Crawl — used by many LLMs as training source
    "google-extended",   # Gemini + Google AI Overviews training opt-out token
    "claudebot",         # Anthropic Claude crawler
    "anthropic-ai",      # Anthropic (legacy / browse fetch)
    "perplexitybot",     # Perplexity AI
    "applebot-extended", # Apple Intelligence training token
    "bytespider",        # ByteDance / TikTok / Doubao AI crawler
    "meta-externalagent",# Meta AI training crawler
    "cohere-ai",         # Cohere
]


def _parse_ia_bot_rules(robots_text: str) -> tuple[list[str], list[str], list[str]]:
    """Walk through robots.txt and figure out which IA bots are mentioned.

    Returns three lists (declared, blocked, allowed):
      • declared: bot has its own "User-agent: <bot>" stanza
      • blocked:  declared AND its first Disallow rule blocks the whole site
      • allowed:  declared AND has Allow: / (the GEO-recommended state)
    """
    declared: list[str] = []
    blocked: list[str] = []
    allowed: list[str] = []
    # Walk the file once, keeping the current "User-agent: …" stanza in scope.
    current_bot: str | None = None
    bot_disallow: dict[str, list[str]] = {}
    bot_allow: dict[str, list[str]] = {}
    for raw_line in robots_text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            current_bot = None
            continue
        lower = line.lower()
        if lower.startswith("user-agent:"):
            agent = lower.split(":", 1)[1].strip()
            if agent in _IA_BOTS:
                current_bot = agent
                if agent not in declared:
                    declared.append(agent)
                bot_disallow.setdefault(agent, [])
                bot_allow.setdefault(agent, [])
            else:
                current_bot = None
            continue
        if current_bot is None:
            continue
        if lower.startswith("disallow:"):
            val = line.split(":", 1)[1].strip()
            bot_disallow[current_bot].append(val)
        elif lower.startswith("allow:"):
            val = line.split(":", 1)[1].strip()
            bot_allow[current_bot].append(val)

    for bot in declared:
        d_rules = bot_disallow.get(bot, [])
        a_rules = bot_allow.get(bot, [])
        # Blocked = the bot has Disallow: / (or equivalent) and no Allow: /
        # overrides it.
        if "/" in d_rules and "/" not in a_rules:
            blocked.append(bot)
        if "/" in a_rules:
            allowed.append(bot)
    return declared, blocked, allowed


_JSONLD_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    flags=re.IGNORECASE | re.DOTALL,
)


def _extract_jsonld_types(html: str) -> tuple[list[str], int, str | None]:
    """Pull every <script type=\"application/ld+json\"> block out of the
    homepage HTML and return the deduplicated set of @type values found
    (sorted), the raw block count, and a short preview for the slide.
    """
    import json as _json

    matches = _JSONLD_RE.findall(html)
    found: set[str] = set()
    blocks_count = 0
    first_preview: str | None = None
    for blob in matches:
        blocks_count += 1
        try:
            data = _json.loads(blob.strip())
        except Exception:  # noqa: BLE001
            # Some sites wrap JSON-LD with CDATA or have invalid JSON —
            # still count the block but skip parsing.
            if first_preview is None:
                first_preview = blob.strip()[:300]
            continue
        # JSON-LD can be an object, a list of objects, or have @graph nesting.
        for t in _collect_types(data):
            found.add(t)
        if first_preview is None:
            try:
                first_preview = _json.dumps(data, ensure_ascii=False, indent=2)[:300]
            except Exception:  # noqa: BLE001
                first_preview = blob.strip()[:300]
    return sorted(found), blocks_count, first_preview


def _collect_types(node) -> list[str]:
    """Recursively walk a parsed JSON-LD payload and yield @type strings."""
    out: list[str] = []
    if isinstance(node, dict):
        t = node.get("@type")
        if isinstance(t, str):
            out.append(t)
        elif isinstance(t, list):
            for v in t:
                if isinstance(v, str):
                    out.append(v)
        # @graph nests further schema objects
        for key in ("@graph", "mainEntity", "itemListElement", "publisher", "author"):
            if key in node:
                out.extend(_collect_types(node[key]))
    elif isinstance(node, list):
        for item in node:
            out.extend(_collect_types(item))
    return out


async def _sample_etag_headers(origin: str, sitemap_url_candidates: list[str]) -> HeadersSampleInfo:
    """HEAD a handful of URLs (5 max) and tally how many ship an ETag or a
    Last-Modified header. Used by the GEO slide on crawler budget."""
    targets = [origin]
    # Cheap mini-expansion: pull a few URLs from the first sitemap if available
    # without doing the full re-walk we already did upstream.
    if sitemap_url_candidates:
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                r = await c.get(sitemap_url_candidates[0])
                if 200 <= r.status_code < 300:
                    locs = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", r.text)
                    targets.extend(locs[:4])
        except httpx.HTTPError:
            pass
    targets = list(dict.fromkeys(targets))[:5]
    with_etag = 0
    with_lm = 0
    async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
        for url in targets:
            try:
                r = await client.head(url)
                if r.headers.get("etag"):
                    with_etag += 1
                if r.headers.get("last-modified"):
                    with_lm += 1
            except httpx.HTTPError:
                continue
    return HeadersSampleInfo(
        sample_size=len(targets),
        with_etag=with_etag,
        with_last_modified=with_lm,
    )


@router.post("/site-resources", response_model=SiteResourcesOut)
async def site_resources(payload: SiteResourcesIn) -> SiteResourcesOut:
    """Fetch robots.txt + sitemap.xml + llms.txt for the given origin.

    Used by the advanced audit creation flow — the frontend can't fetch these
    cross-origin from the browser due to CORS, so we proxy the GETs here.
    Every individual fetch is independent: a failure on one doesn't block the
    others; the corresponding `fetched` flag is set to false.
    """
    origin = _normalise_origin(payload.origin)
    robots = RobotsTxtInfo(fetched=False)
    sitemap = SitemapInfo(fetched=False)
    llms = LlmsTxtInfo(fetched=False)
    structured = StructuredDataInfo(homepage_fetched=False)
    headers_sample = HeadersSampleInfo()
    robots_text = ""
    sitemap_url_candidates: list[str] = []

    async with httpx.AsyncClient(follow_redirects=True, timeout=15, headers={"User-Agent": "PerfectContent-Audit/1.0"}) as client:
        # ----- robots.txt -----
        try:
            r = await client.get(f"{origin}/robots.txt")
            if 200 <= r.status_code < 300 and r.text.strip():
                robots_text = r.text
                lines = [ln for ln in robots_text.splitlines() if ln.strip()]
                user_agents = sum(1 for ln in lines if ln.strip().lower().startswith("user-agent:"))
                disallow = sum(1 for ln in lines if ln.strip().lower().startswith("disallow:"))
                allow = sum(1 for ln in lines if ln.strip().lower().startswith("allow:"))
                # Extract sitemap refs
                for ln in lines:
                    m = re.match(r"\s*sitemap\s*:\s*(\S+)\s*$", ln, flags=re.IGNORECASE)
                    if m:
                        sitemap_url_candidates.append(m.group(1))
                ia_declared, ia_blocked, ia_allowed = _parse_ia_bot_rules(robots_text)
                robots = RobotsTxtInfo(
                    fetched=True,
                    size_bytes=len(robots_text.encode("utf-8")),
                    lines=len(lines),
                    has_sitemap_ref=bool(sitemap_url_candidates),
                    user_agents=user_agents,
                    disallow_count=disallow,
                    allow_count=allow,
                    raw_preview=robots_text[:600],
                    ia_bots_declared=ia_declared,
                    ia_bots_blocked=ia_blocked,
                    ia_bots_allowed=ia_allowed,
                )
        except httpx.HTTPError:
            pass

        # If no sitemap mentioned in robots.txt, try the canonical paths
        if not sitemap_url_candidates:
            for candidate in (f"{origin}/sitemap.xml", f"{origin}/sitemap_index.xml", f"{origin}/wp-sitemap.xml"):
                try:
                    h = await client.head(candidate, timeout=8)
                    if 200 <= h.status_code < 300:
                        sitemap_url_candidates.append(candidate)
                        break
                except httpx.HTTPError:
                    continue

        # ----- sitemap expansion -----
        if sitemap_url_candidates:
            all_urls: list[str] = []
            nested_total = 0
            for sm_url in sitemap_url_candidates[:5]:  # cap top-level sitemaps to 5
                urls, nested = await _expand_sitemap(client, sm_url)
                all_urls.extend(urls)
                nested_total += nested
                if len(all_urls) >= 50000:
                    break
            seen: set[str] = set()
            duplicates = 0
            for u in all_urls:
                if u in seen:
                    duplicates += 1
                else:
                    seen.add(u)
            sitemap = SitemapInfo(
                fetched=bool(all_urls),
                url_count=len(seen),
                nested_count=nested_total,
                duplicates=duplicates,
                reference_in_robots=bool(sitemap_url_candidates and robots.has_sitemap_ref),
            )

        # ----- llms.txt -----
        try:
            r = await client.get(f"{origin}/llms.txt", timeout=10)
            if 200 <= r.status_code < 300 and r.text.strip():
                llms = LlmsTxtInfo(
                    fetched=True,
                    size_bytes=len(r.text.encode("utf-8")),
                    lines=sum(1 for ln in r.text.splitlines() if ln.strip()),
                )
        except httpx.HTTPError:
            pass

        # ----- homepage HTML → JSON-LD detection -----
        # Powers the new "Données structurées" section. We grab the raw HTML
        # of the origin, regex out every <script type="application/ld+json">
        # block, and pull the @type values. Best-effort: a single GET, no
        # parsing of nested pages — enough for the slide to say "Organization
        # is on the home, but Product/FAQPage are nowhere".
        try:
            r = await client.get(origin, timeout=15)
            if 200 <= r.status_code < 300 and r.text:
                schemas, blocks_count, preview = _extract_jsonld_types(r.text)
                structured = StructuredDataInfo(
                    homepage_fetched=True,
                    blocks_count=blocks_count,
                    schemas_found=schemas,
                    raw_preview=preview,
                )
        except httpx.HTTPError:
            pass

    # Sample ETag/Last-Modified on 5 known URLs (homepage + 4 from the
    # sitemap when available). The agency benchmark flags pages that ship
    # without ETag because Googlebot/GPTBot/ClaudeBot have to re-download
    # the full body on every visit. Each HEAD short-circuits at 8 s.
    headers_sample = await _sample_etag_headers(origin, sitemap_url_candidates)

    return SiteResourcesOut(
        origin=origin,
        robots_txt=robots,
        sitemap_xml=sitemap,
        llms_txt=llms,
        structured_data=structured,
        headers_sample=headers_sample,
    )


# ---- Priority summary (Claude Haiku) -------------------------------------


class PriorityIn(BaseModel):
    audit_name: str
    domain: str | None = None
    url_count: int
    global_score: int
    section_summaries: list[dict]  # [{label, score, weight, summary}]
    priorities: list[dict]  # [{rank, title, urgency, effort, impact, affected, rationale}]


class PriorityOut(BaseModel):
    summary: str
    cost_usd: float


@router.post("/priority-summary", response_model=PriorityOut)
async def priority_summary(payload: PriorityIn) -> PriorityOut:
    """Generate a short consultant-style narrative of the priority list.

    Costs ~0.002 $ per call (Haiku 4.5). We send numbers + labels only —
    never URLs — to keep the prompt small and the input fully anonymous.
    """
    from app.services.llm import HAIKU, complete

    sections_txt = "\n".join(
        f"- {s['label']} : score {s['score']}/100, poids {s['weight']}, {s['summary']}"
        for s in payload.section_summaries
    )
    prio_txt = "\n".join(
        f"{p['rank']}. {p['title']} — urgence {p['urgency']}, {p['affected']} URLs, effort {p['effort']}, impact {p['impact']}. ({p['rationale']})"
        for p in payload.priorities[:12]
    )

    system = (
        "Tu es un consultant SEO senior français qui synthétise un audit technique. "
        "Tu rédiges UN paragraphe court (4-6 phrases) de synthèse pour la slide finale d'un livrable client : "
        "tu nommes le sujet principal à traiter en priorité, tu expliques pourquoi en t'appuyant sur les chiffres, "
        "et tu termines sur une recommandation d'ordre de chantier (actions rapides puis chantiers de fond). "
        "Style : direct, factuel, sans superlatifs, sans listes à puces, sans titres. "
        "IMPORTANT — tu écris du texte brut destiné à être affiché tel quel sur une slide : "
        "n'utilise AUCUNE syntaxe Markdown. Pas d'astérisques (*texte* ou **texte**) pour le gras ou l'italique, "
        "pas de backticks pour les citations, pas de tirets pour faire des listes, pas de dièses pour des titres. "
        "Pas de termes anglais non plus : écris « actions rapides » au lieu de « quick wins », "
        "« liens entrants » au lieu de « inlinks », « balise title » au lieu de « title tag », etc."
    )
    user = f"""Audit technique avancé : {payload.audit_name}{f' ({payload.domain})' if payload.domain else ''}
{payload.url_count:,} URLs analysées · score global {payload.global_score}/100.

Scores par catégorie :
{sections_txt}

Top {min(len(payload.priorities), 12)} priorités (classement déterministe basé sur sévérité × volume × poids SEO) :
{prio_txt}

Rédige le paragraphe de synthèse pour la slide "Priorisation des corrections"."""

    try:
        resp = await complete(
            system=system,
            user=user,
            model=HAIKU,
            max_tokens=600,
            temperature=0.3,
        )
        return PriorityOut(summary=resp.text.strip(), cost_usd=resp.cost)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"AI summary failed: {exc}")
