import re
from uuid import UUID
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
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


class AuditUpdateIn(BaseModel):
    """Partial update for an audit. Used by the in-app slide editor to
    persist edited / reordered / added slides and the optional rename.
    Only the provided fields are touched.
    """
    name: str | None = None
    summary: dict | None = None  # the full edited summary (slides live here)
    score: float | None = None


@router.patch("/{audit_id}", response_model=AuditOut)
async def update_audit(
    audit_id: UUID, payload: AuditUpdateIn, db: AsyncSession = Depends(get_db)
) -> Audit:
    audit = await db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit not found")
    if payload.name is not None:
        audit.name = payload.name
    if payload.summary is not None:
        audit.summary = payload.summary
    if payload.score is not None:
        audit.score = payload.score
    await db.commit()
    await db.refresh(audit)
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
    # Restrict to http/https : never let the caller force file://, ftp://, etc.
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
        # Only the <loc> that is a DIRECT child of a <sitemap> entry : never
        # a <loc> nested in an extension block.
        for sm in root:
            if _localname(sm.tag) != "sitemap":
                continue
            child_url = ""
            for child in sm:
                if _localname(child.tag) == "loc":
                    child_url = (child.text or "").strip()
                    break
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
        # Take ONE <loc> per <url> entry. Iterating every <loc> via
        # root.iter() would also pick up <image:loc> / <video:loc> from the
        # image/video sitemap extensions (the namespace prefix is stripped by
        # _localname), inflating the URL count : the exact "1400 vs 1374"
        # discrepancy the client saw.
        for url_el in root:
            if _localname(url_el.tag) != "url":
                continue
            for child in url_el:
                if _localname(child.tag) == "loc":
                    u = (child.text or "").strip()
                    if u:
                        urls.append(u)
                    break
            if len(urls) >= cap:
                break
        return urls, 0
    return [], 0


# Bots IA we explicitly look for in robots.txt. Mirrors the audit standard
# from agencies (datashake, semrush…): every name lowercased, stable order.
_IA_BOTS = [
    "gptbot",            # OpenAI training crawler (ChatGPT)
    "chatgpt-user",      # ChatGPT browse-with-bing real-time fetches
    "ccbot",             # Common Crawl : used by many LLMs as training source
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
            # Some sites wrap JSON-LD with CDATA or have invalid JSON :             # still count the block but skip parsing.
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

    Used by the advanced audit creation flow : the frontend can't fetch these
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
        # parsing of nested pages : enough for the slide to say "Organization
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

    Costs ~0.002 $ per call (Haiku 4.5). We send numbers + labels only :     never URLs : to keep the prompt small and the input fully anonymous.
    """
    from app.services.llm import HAIKU, complete

    sections_txt = "\n".join(
        f"- {s['label']} : score {s['score']}/100, poids {s['weight']}, {s['summary']}"
        for s in payload.section_summaries
    )
    prio_txt = "\n".join(
        f"{p['rank']}. {p['title']} : urgence {p['urgency']}, {p['affected']} URLs, effort {p['effort']}, impact {p['impact']}. ({p['rationale']})"
        for p in payload.priorities[:12]
    )

    system = (
        "Tu es un consultant SEO senior français qui synthétise un audit technique. "
        "Tu rédiges UN paragraphe COURT (3 phrases maximum, 60 mots au total) pour la slide finale. "
        "Le tableau des priorités est juste à côté : NE le réénumère PAS. "
        "Phrase 1 : le chantier prioritaire et pourquoi (1 chiffre clé). Phrase 2 : le second levier. "
        "Phrase 3 : l'ordre conseillé (actions rapides d'abord, chantiers de fond ensuite). "
        "Style : direct, factuel, sans superlatifs, sans listes à puces, sans titres. "
        "Tu écris du texte brut destiné à être affiché tel quel sur une slide : "
        "n'utilise AUCUNE syntaxe Markdown. Pas d'astérisques (*texte* ou **texte**) pour le gras ou l'italique, "
        "pas de backticks pour les citations, pas de tirets pour faire des listes, pas de dièses pour des titres. "
        "Pas de tirets cadratins ( : ) non plus : utilise « : », une virgule ou un point. "
        "Pas de termes anglais : écris « actions rapides » au lieu de « quick wins », "
        "« liens entrants » au lieu de « inlinks », « balise title » au lieu de « title tag ». "
        "ATTENTION : les pages en noindex ne sont PAS une erreur. C'est la plupart du temps volontaire "
        "(panier, compte client, page de remerciement après formulaire, filtres facettes, recherche interne). "
        "Si tu mentionnes le noindex, qualifie-le UNIQUEMENT comme « à passer en revue pour vérifier que c'est intentionnel », "
        "JAMAIS comme un blocage d'indexation ou un chantier critique. "
        "De même, ne sur-dramatise pas les volumes : un site avec 30 pages noindex et 3 liens externes 404 reste un site sain."
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
            max_tokens=220,
            temperature=0.3,
        )
        return PriorityOut(summary=resp.text.strip(), cost_usd=resp.cost)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"AI summary failed: {exc}")


# =========================================================================
# Advanced audit AI v2 : synthesis intro, robots.txt analysis,
# sitemap deep-scan + analysis. Each endpoint sticks to short output
# (capped tokens) so the slide content never overflows its box.
# =========================================================================


class SynthesisIn(BaseModel):
    audit_name: str
    domain: str | None = None
    global_score: int
    sections: list[dict]  # [{label, score, weight}]


class SynthesisOut(BaseModel):
    intro: str            # 2-3 short sentences, no lists
    best: list[str]       # top 3 categories "Web performance (90%)"
    worst: list[str]      # bottom 3 categories same format


@router.post("/synthesis-overview", response_model=SynthesisOut)
async def synthesis_overview(payload: SynthesisIn) -> SynthesisOut:
    """Short editorial intro for the synthesis slide + best/worst categories.

    The frontend renders the radar chart on the right and the intro + lists
    on the left, so we keep the LLM output strictly to a short paragraph.
    Costs ~0.001 $ per call (Haiku 4.5).
    """
    from app.services.llm import HAIKU, complete
    import json as _json

    sorted_secs = sorted(payload.sections, key=lambda s: int(s.get("score", 0)))
    worst3 = sorted_secs[:3]
    best3 = list(reversed(sorted_secs[-3:]))

    def _fmt(s: dict) -> str:
        return f'{s["label"]} ({int(s["score"])}%)'

    best = [_fmt(s) for s in best3]
    worst = [_fmt(s) for s in worst3]

    system = (
        "Tu es un consultant SEO senior français. Tu rédiges l'intro d'une slide de synthèse d'audit. "
        "Le graphique radar à droite affiche déjà tous les scores par catégorie : NE LES REPETE PAS, "
        "ne liste aucune catégorie, ne donne aucun chiffre, ne dis pas le score global. "
        "DEUX phrases maximum, 35 à 45 mots au total. Aucune liste, aucun titre, aucun Markdown, "
        "aucune asterisque, pas de tirets cadratins, pas d'anglais. "
        "Tu cherches l'angle qualitatif : posture générale du site, opposition entre fondamentaux solides "
        "et leviers techniques sous-exploités, ton synthétique et un peu rédactionnel. Pas de blabla. "
        "Tu écris du texte brut destiné à être affiché tel quel sur la slide."
    )
    user = (
        f"Audit : {payload.audit_name}{f' ({payload.domain})' if payload.domain else ''}\n"
        f"Score global (NE PAS le mentionner explicitement) : {payload.global_score}/100\n"
        f"Catégories les mieux notées (NE PAS les lister) : {', '.join(best)}\n"
        f"Catégories les plus faibles (NE PAS les lister) : {', '.join(worst)}\n\n"
        "Rédige l'intro qualitative (2 phrases max, 35-45 mots)."
    )
    try:
        resp = await complete(system=system, user=user, model=HAIKU, max_tokens=180, temperature=0.3)
        return SynthesisOut(intro=resp.text.strip(), best=best, worst=worst)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"AI synthesis failed: {exc}")


class RobotsAnalysisIn(BaseModel):
    domain: str | None = None
    # The pasted robots.txt content (raw). Capped here so we never blow the
    # context window on a 50 KB file (Wordfence-polluted robots.txt can be
    # massive). 30 000 chars is plenty for a real one.
    content: str

    @field_validator("content")
    @classmethod
    def _cap(cls, v: str) -> str:
        return (v or "")[:30_000]


class RobotsAnalysisOut(BaseModel):
    is_good: bool                       # if False, frontend shows the "improved" slide
    current_analysis: str               # 4-6 short paragraph-bullets describing the current state
    issues: list[str]                   # 3 to 6 concrete pain points
    improved_content: str | None        # the recommended rewritten robots.txt (when not is_good)
    improvements: list[str]             # 3 to 6 changes between current and improved


@router.post("/robots-analysis", response_model=RobotsAnalysisOut)
async def robots_analysis(payload: RobotsAnalysisIn) -> RobotsAnalysisOut:
    """AI analysis of the client's robots.txt.

    Returns:
      • a 4-line description of the current state (what it does, where it
        comes from based on signals like Wordfence rules / Umbraco
        leftovers / .htaccess blocks)
      • a list of concrete issues
      • whether the file is already good (one slide) or improvable (two slides)
      • when improvable, a fully rewritten clean robots.txt + the list of
        improvements

    Costs ~0.005 $ per call.
    """
    from app.services.llm import HAIKU, complete
    import json as _json

    content = payload.content.strip()
    if not content:
        raise HTTPException(400, "robots.txt content is empty")

    system = (
        "Tu es un consultant SEO senior français spécialiste du robots.txt. "
        "Tu reçois le contenu brut du robots.txt d'un client et tu le diagnostiques. "
        "Tu retournes UNIQUEMENT un objet JSON, sans Markdown autour, sans commentaire avant ni après. "
        "Schéma attendu :\n"
        "{\n"
        '  "is_good": bool,                   // true SEULEMENT si le fichier est déjà propre et complet (rare)\n'
        '  "current_analysis": "string",      // 3 à 4 phrases courtes décrivant ce que fait le fichier et d\'où il vient (signaux : Wordfence, Umbraco, .htaccess hérités, etc.)\n'
        '  "issues": ["string", ...],          // 3 à 6 points bloquants concrets, phrases courtes\n'
        '  "improved_content": "string|null", // robots.txt nettoyé recommandé (null si is_good=true) ; 30 LIGNES MAX\n'
        '  "improvements": ["string", ...]     // 3 à 6 changements clés (vide si is_good=true)\n'
        "}\n"
        "Règles éditoriales : pas de tirets cadratins, pas d'anglais (utilise « bots IA » au lieu de « AI bots »), "
        "pas d'asterisques Markdown. Limite chaque phrase à 25 mots.\n\n"
        "RÈGLES STRICTES pour le improved_content (robots.txt recommandé) :\n"
        "1. MAX 30 LIGNES, idéalement 15 à 20. Compact, lisible, maintenable.\n"
        "2. INTERDICTION ABSOLUE de transformer un Disallow inutile en Allow. "
        "Si une règle Disallow ne sert à rien (protection par obscurité, ancienne extension, etc.), "
        "tu la SUPPRIMES purement et simplement du nouveau fichier, tu n'écris PAS Allow: /xxx à la place. "
        "Allow: /xxx ne sert à rien si Disallow ne bloque pas /xxx, donc Allow ne doit apparaître QUE "
        "pour ré-autoriser explicitement un sous-chemin d'un Disallow qui reste utile.\n"
        "3. Aucun commentaire (#) sauf un seul d'en-tête optionnel.\n"
        "4. Pour les bots IA, déclare GPTBot, ChatGPT-User, CCBot, Google-Extended, ClaudeBot, "
        "PerplexityBot avec Allow: / (c'est légitime ici car c'est ce qu'on veut ré-autoriser explicitement).\n"
        "5. Termine par la ligne Sitemap: <url> si une URL de sitemap est connue, sinon omets-la."
    )
    user_msg = f"Domaine : {payload.domain or 'inconnu'}\n\nrobots.txt actuel :\n```\n{content}\n```"

    try:
        resp = await complete(system=system, user=user_msg, model=HAIKU, max_tokens=1600, temperature=0.2)
        # Parse JSON (the model occasionally wraps in ```json fences; strip them)
        txt = resp.text.strip()
        if txt.startswith("```"):
            txt = txt.strip("`").lstrip("json").strip()
        data = _json.loads(txt)
        improved = str(data.get("improved_content") or "").strip()
        if improved and not data.get("is_good"):
            improved = _clean_improved_robots(improved)
        return RobotsAnalysisOut(
            is_good=bool(data.get("is_good", False)),
            current_analysis=str(data.get("current_analysis", "")).strip(),
            issues=[str(x).strip() for x in (data.get("issues") or [])][:8],
            improved_content=(improved or None) if not data.get("is_good") else None,
            improvements=[str(x).strip() for x in (data.get("improvements") or [])][:8],
        )
    except _json.JSONDecodeError as exc:
        raise HTTPException(500, f"AI returned invalid JSON: {exc}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"AI robots analysis failed: {exc}")


def _clean_improved_robots(raw: str) -> str:
    """Server-side safety net for the AI-generated improved robots.txt.

    The model has been instructed not to introduce useless ``Allow: /xxx``
    rules (re-allowing what was previously disallowed), but we enforce it
    deterministically here so the deliverable is clean even when the model
    slips. The rules are scoped per ``User-agent:`` block :

      • The universal ``Allow: /`` is ALWAYS kept (it's how we explicitly
        whitelist a bot).
      • Any other ``Allow: /<path>`` is dropped unless ``/<path>`` is a
        strict sub-path of one of the ``Disallow:`` paths still present
        in the same block.
      • Empty trailing blocks are collapsed.
    """
    blocks: list[list[str]] = [[]]
    for line in raw.splitlines():
        if line.strip().lower().startswith("user-agent:") and blocks[-1]:
            blocks.append([])
        blocks[-1].append(line)

    def _path(value: str) -> str:
        return value.split(":", 1)[1].strip() if ":" in value else ""

    out_lines: list[str] = []
    for block in blocks:
        disallows = [_path(l) for l in block if l.strip().lower().startswith("disallow:") and _path(l)]
        cleaned: list[str] = []
        for line in block:
            stripped = line.strip()
            low = stripped.lower()
            if low.startswith("allow:"):
                path = _path(stripped)
                if path == "/" or not path:
                    cleaned.append(line)
                    continue
                # Keep only if it's a sub-path of a remaining Disallow.
                if any(path.startswith(d) and d not in ("", "/") for d in disallows):
                    cleaned.append(line)
                # else: drop the Allow (it would just re-allow what's
                # already allowed by default).
                continue
            cleaned.append(line)
        out_lines.extend(cleaned)

    # Collapse 3+ consecutive blank lines to a single blank line.
    collapsed: list[str] = []
    blanks = 0
    for line in out_lines:
        if not line.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        collapsed.append(line)
    return "\n".join(collapsed).strip() + "\n"


class SitemapAnalysisIn(BaseModel):
    domain: str | None = None
    sitemap_url: str                    # https://example.com/sitemap.xml
    indexable_urls: list[str] = []      # all indexable URLs from interne_html.csv

    @field_validator("indexable_urls")
    @classmethod
    def _cap_urls(cls, v: list[str]) -> list[str]:
        # Cap at 5 000 URLs to keep the prompt size sane. We only send these
        # to the LLM as a SAMPLE + counts; the gap analysis is done in code
        # before we even call the model.
        return v[:5_000]


class SitemapAnalysisOut(BaseModel):
    fetched: bool
    sitemap_url_count: int              # total URLs found in the sitemap (index expansion done server-side)
    indexable_count: int                # # of indexable URLs from the crawl
    missing_count: int                  # # of indexable URLs NOT in the sitemap
    overview: str                       # 3-5 short sentences about the sitemap structure
    gaps_summary: str | None            # 3-5 short sentences about what's missing (null when nothing's missing)
    gap_breakdown: list[dict] = []      # [{label, count}] counts of missing URLs grouped by URL pattern
    last_modified: str | None = None    # ISO date from the sitemap Last-Modified header / lastmod
    error: str | None = None            # populated on fetch failure


def _path_pattern(url: str) -> str:
    """Group URLs by their first significant path segment for the gap report."""
    try:
        p = urlparse(url)
        parts = [s for s in p.path.split("/") if s]
        return f"/{parts[0]}/" if parts else "/ (racine)"
    except Exception:
        return "(non parseable)"


@router.post("/sitemap-analysis", response_model=SitemapAnalysisOut)
async def sitemap_analysis(payload: SitemapAnalysisIn) -> SitemapAnalysisOut:
    """Fetch the sitemap, count URLs, compute the gap vs the indexable crawl,
    and ask the LLM to write a short readable analysis.

    Robust to sitemap-indexes (expanded recursively, same logic as
    _expand_sitemap above).
    """
    from app.services.llm import HAIKU, complete

    sm_url = payload.sitemap_url.strip()
    if not sm_url:
        raise HTTPException(400, "sitemap_url is empty")
    if not sm_url.startswith(("http://", "https://")):
        sm_url = "https://" + sm_url.lstrip("/")

    # Fetch + expand
    last_modified: str | None = None
    sitemap_urls: list[str] = []
    try:
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "PerfectContent/1.0 (+seo audit)"},
        ) as client:
            head_resp = None
            try:
                head_resp = await client.head(sm_url)
            except Exception:
                head_resp = None
            if head_resp is not None and "last-modified" in head_resp.headers:
                last_modified = head_resp.headers["last-modified"]
            urls, _depth = await _expand_sitemap(client, sm_url)
            # Dedup while preserving order : the reported count must be the
            # number of UNIQUE URLs, matching third-party sitemap extractors.
            sitemap_urls = list(dict.fromkeys(urls))
    except Exception as exc:
        return SitemapAnalysisOut(
            fetched=False,
            sitemap_url_count=0,
            indexable_count=len(payload.indexable_urls),
            missing_count=0,
            overview="",
            gaps_summary=None,
            gap_breakdown=[],
            error=f"Échec du fetch : {exc}",
        )

    # Gap analysis : indexable URLs not present in sitemap (case-insensitive on host).
    def _norm(u: str) -> str:
        return u.strip().rstrip("/").lower()

    sm_set = {_norm(u) for u in sitemap_urls}
    indexable = [u for u in payload.indexable_urls if u]
    missing = [u for u in indexable if _norm(u) not in sm_set]

    # Group missing URLs by first path segment
    groups: dict[str, int] = {}
    for u in missing:
        groups[_path_pattern(u)] = groups.get(_path_pattern(u), 0) + 1
    gap_breakdown = sorted(
        ({"label": k, "count": v} for k, v in groups.items()),
        key=lambda x: x["count"],
        reverse=True,
    )[:8]

    # LLM step : ask for the editorial overview + a gap summary
    # Pre-aggregate so the prompt stays small.
    sm_groups: dict[str, int] = {}
    for u in sitemap_urls:
        sm_groups[_path_pattern(u)] = sm_groups.get(_path_pattern(u), 0) + 1
    sm_breakdown = sorted(sm_groups.items(), key=lambda kv: kv[1], reverse=True)[:8]

    sm_breakdown_txt = ", ".join(f"{lbl}: {n}" for lbl, n in sm_breakdown) or "(vide)"
    gap_txt = ", ".join(f"{g['label']}: {g['count']}" for g in gap_breakdown[:6]) or "(aucun)"

    # Sitemap-vs-crawl excess : when the sitemap lists notably MORE URLs than
    # the crawl found indexable, that's a real signal (stale entries, URLs the
    # crawl couldn't reach, non-indexable or removed pages) the consultant
    # wants flagged. Computed deterministically so the LLM can't miss it.
    excess = max(0, len(sitemap_urls) - len(indexable))
    excess_pct = round(excess / max(len(indexable), 1) * 100)

    system = (
        "Tu es un consultant SEO senior français. Tu rédiges l'analyse d'un sitemap.xml pour une slide d'audit. "
        "Tu retournes UNIQUEMENT un objet JSON sans Markdown autour. Schéma :\n"
        "{\n"
        '  "overview": "string",     // 2 a 4 phrases courtes : volume d\'URLs, typologies dominantes, structure sitemap-index ou non, et ECART eventuel avec le crawl\n'
        '  "gaps_summary": "string"   // 2 a 4 phrases si des URLs sont absentes ; sinon null\n'
        "}\n"
        "REGLES ANTI-HALLUCINATION STRICTES :\n"
        "1. Tu n'utilises QUE les chiffres et les libelles de chemins fournis ci-dessous. "
        "INTERDICTION d'inventer une section, un dossier ou un type de page qui n'est pas dans les listes donnees. "
        "Si un chemin s'appelle /questions/, tu ecris /questions/, tu ne le renommes pas en /faq/ ni en autre chose. "
        "Ces libelles sont des PREFIXES d'URL (premier segment de chemin), PAS des noms de sous-sitemaps : "
        "ne parle pas de « sitemap /crm/ » mais de « pages sous /crm/ ».\n"
        "2. INTERDICTION d'inventer des chiffres : reprends exactement ceux fournis.\n"
        "3. Si la repartition des absences est vide ou « (aucun) », gaps_summary doit etre null.\n"
        "4. Si le sitemap contient nettement PLUS d'URLs que les URLs indexables du crawl (ecart fourni ci-dessous), "
        "tu DOIS le signaler dans overview : cela peut indiquer des URLs obsoletes, non explorees, non indexables "
        "ou supprimees encore listees dans le sitemap. Reste factuel, ne sur-dramatise pas.\n"
        "Regles editoriales : pas de Markdown, pas de tirets cadratins, pas d'asterisques, pas d'anglais, "
        "phrases courtes (25 mots max). Tu peux rester general si les libelles ne sont pas parlants, "
        "mais tu ne dois JAMAIS citer un chemin absent des listes."
    )
    user_msg = (
        f"Domaine : {payload.domain or 'inconnu'}\n"
        f"Sitemap URL : {sm_url}\n"
        f"Nombre total d'URLs UNIQUES dans le sitemap : {len(sitemap_urls)}\n"
        f"Repartition du sitemap par chemin (libelles EXACTS a reutiliser tels quels) : {sm_breakdown_txt}\n"
        f"Derniere modification : {last_modified or 'inconnue'}\n"
        f"URLs indexables (crawl) : {len(indexable)}\n"
        f"Ecart sitemap - indexables crawl : {excess} URLs de plus dans le sitemap ({excess_pct} %)\n"
        f"URLs indexables ABSENTES du sitemap : {len(missing)}\n"
        f"Repartition des absences par chemin (libelles EXACTS a reutiliser tels quels) : {gap_txt}\n"
    )
    overview = ""
    gaps_summary: str | None = None
    try:
        resp = await complete(system=system, user=user_msg, model=HAIKU, max_tokens=600, temperature=0.2)
        import json as _json
        txt = resp.text.strip()
        if txt.startswith("```"):
            txt = txt.strip("`").lstrip("json").strip()
        data = _json.loads(txt)
        overview = str(data.get("overview", "")).strip()
        gaps_summary = str(data.get("gaps_summary") or "").strip() or None
    except Exception:
        # Graceful fallback : present the raw stats without AI commentary.
        overview = (
            f"Le sitemap contient {len(sitemap_urls)} URLs, réparties principalement sur {sm_breakdown_txt}. "
            f"Dernière modification : {last_modified or 'non communiquée'}."
        )
        if excess > len(indexable) * 0.1 and excess > 20:
            overview += (
                f" Le sitemap liste {excess} URLs de plus que les {len(indexable)} URLs indexables "
                f"du crawl : à vérifier (URLs obsolètes, non explorées ou non indexables)."
            )
        gaps_summary = (
            f"{len(missing)} URLs indexables du crawl ne figurent pas dans le sitemap. "
            f"Sections principalement absentes : {gap_txt}."
            if missing else None
        )

    return SitemapAnalysisOut(
        fetched=True,
        sitemap_url_count=len(sitemap_urls),
        indexable_count=len(indexable),
        missing_count=len(missing),
        overview=overview,
        gaps_summary=gaps_summary,
        gap_breakdown=gap_breakdown,
        last_modified=last_modified,
    )


# =========================================================================
# PageSpeed Insights : performance score (mobile) + Core Web Vitals
# (FCP / LCP) + the actionable opportunities for a single page. Called
# once per analysed URL by the advanced-audit creation flow, before the
# audit is persisted. The Google PSI API is free (keyless or with an
# optional API key) so no Claude / paid call is involved here.
# =========================================================================


class PageSpeedIn(BaseModel):
    url: str
    strategy: str = "mobile"  # "mobile" (default, mobile-first) or "desktop"

    @field_validator("url")
    @classmethod
    def _check_url(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("url is empty")
        if not v.startswith(("http://", "https://")):
            v = "https://" + v.lstrip("/")
        return v

    @field_validator("strategy")
    @classmethod
    def _check_strategy(cls, v: str) -> str:
        v = (v or "mobile").strip().lower()
        return v if v in ("mobile", "desktop") else "mobile"


class PageSpeedMetricOut(BaseModel):
    id: str
    label: str
    display: str        # human-readable value, e.g. "2,1 s" or "0,02"
    score: float | None  # 0..1 (Lighthouse audit score), null when unscored


class PageSpeedOpportunityOut(BaseModel):
    id: str
    title: str          # audit title, e.g. "Différer les images hors écran"
    display: str        # displayValue, e.g. "Économie estimée de 1,2 s" (may be "")
    description: str     # plain-text audit description (markdown stripped)
    savings_ms: float    # estimated savings in ms (0 when none)
    score: float | None  # 0..1, lower = bigger problem


class PageSpeedOut(BaseModel):
    url: str
    final_url: str | None = None
    strategy: str
    fetched: bool
    performance_score: int | None = None  # 0..100
    fcp: PageSpeedMetricOut | None = None
    lcp: PageSpeedMetricOut | None = None
    metrics: list[PageSpeedMetricOut] = []
    opportunities: list[PageSpeedOpportunityOut] = []
    error: str | None = None


# Lighthouse metric audit ids : these are the timing metrics, NOT the
# actionable "opportunities", so we exclude them from the problem list.
_PSI_METRIC_IDS = {
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
    "interactive",
    "max-potential-fid",
    "first-meaningful-paint",
    "server-response-time",
}

_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _strip_markdown(text: str) -> str:
    """Lighthouse descriptions are markdown ([text](url), backticks…).
    Flatten them to plain text for the slide + XLSX."""
    if not text:
        return ""
    text = _MD_LINK_RE.sub(r"\1", text)          # [label](url) -> label
    text = text.replace("`", "")                  # inline code ticks
    text = re.sub(r"\s+", " ", text).strip()
    return text


@router.post("/pagespeed", response_model=PageSpeedOut)
async def pagespeed(payload: PageSpeedIn) -> PageSpeedOut:
    """Run Google PageSpeed Insights (Lighthouse, performance category) on a
    single URL and return the score + FCP/LCP + the actionable opportunities.

    Keyless by default; uses PAGESPEED_API_KEY when configured for a higher
    quota. One URL per call so each stays well under the serverless timeout.
    """
    from app.config import get_settings

    settings = get_settings()
    params = {
        "url": payload.url,
        "strategy": payload.strategy,
        "category": "performance",
    }
    if settings.pagespeed_api_key:
        params["key"] = settings.pagespeed_api_key

    try:
        async with httpx.AsyncClient(timeout=55.0, follow_redirects=True) as client:
            r = await client.get(
                "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                params=params,
            )
        if r.status_code != 200:
            # Surface the Google error message when present.
            msg = f"HTTP {r.status_code}"
            try:
                err = r.json().get("error", {})
                msg = err.get("message", msg)
            except Exception:  # noqa: BLE001
                pass
            # Quota / rate-limit : the keyless PSI quota is SHARED across every
            # caller on the same egress IP (here : the serverless host), so it
            # can already be exhausted even on a first personal run. Point the
            # user at the fix (configure their own free API key).
            low = msg.lower()
            if r.status_code == 429 or "quota" in low or "rate limit" in low:
                if not settings.pagespeed_api_key:
                    msg = (
                        "Quota PageSpeed Insights dépassé. L'API sans clé partage un quota "
                        "global : configure une clé gratuite PAGESPEED_API_KEY (console Google "
                        "Cloud, API « PageSpeed Insights » activée) pour disposer de ton propre "
                        "quota (25 000 requêtes/jour)."
                    )
                else:
                    msg = (
                        "Quota PageSpeed Insights dépassé pour ta clé API. Vérifie que l'API "
                        "« PageSpeed Insights » est bien activée dans ton projet Google Cloud, "
                        "ou réessaie plus tard."
                    )
            return PageSpeedOut(url=payload.url, strategy=payload.strategy, fetched=False, error=msg)
        data = r.json()
    except Exception as exc:  # noqa: BLE001
        return PageSpeedOut(url=payload.url, strategy=payload.strategy, fetched=False, error=str(exc))

    lh = data.get("lighthouseResult") or {}
    audits: dict = lh.get("audits") or {}
    perf_cat = (lh.get("categories") or {}).get("performance") or {}

    score = perf_cat.get("score")
    performance_score = round(score * 100) if isinstance(score, (int, float)) else None

    def _metric(aid: str, label: str) -> PageSpeedMetricOut | None:
        a = audits.get(aid)
        if not a:
            return None
        return PageSpeedMetricOut(
            id=aid,
            label=label,
            display=str(a.get("displayValue") or ""),
            score=a.get("score"),
        )

    fcp = _metric("first-contentful-paint", "FCP")
    lcp = _metric("largest-contentful-paint", "LCP")
    metrics = [
        m for m in (
            fcp,
            lcp,
            _metric("total-blocking-time", "TBT"),
            _metric("cumulative-layout-shift", "CLS"),
            _metric("speed-index", "Speed Index"),
        )
        if m is not None
    ]

    # Build the actionable problem list from the performance auditRefs :
    # everything that scored below 0.9 and isn't a raw timing metric.
    opportunities: list[PageSpeedOpportunityOut] = []
    for ref in perf_cat.get("auditRefs", []):
        aid = ref.get("id")
        if not aid or aid in _PSI_METRIC_IDS:
            continue
        a = audits.get(aid)
        if not a:
            continue
        mode = a.get("scoreDisplayMode")
        if mode in ("notApplicable", "informative", "manual", "error"):
            continue
        a_score = a.get("score")
        if a_score is None or a_score >= 0.9:
            continue
        details = a.get("details") or {}
        savings = details.get("overallSavingsMs")
        if savings is None:
            savings = a.get("numericValue") if a.get("numericUnit") == "millisecond" else None
        opportunities.append(
            PageSpeedOpportunityOut(
                id=aid,
                title=str(a.get("title") or ""),
                display=str(a.get("displayValue") or ""),
                description=_strip_markdown(str(a.get("description") or "")),
                savings_ms=float(savings) if isinstance(savings, (int, float)) else 0.0,
                score=a_score,
            )
        )
    # Worst first : biggest estimated savings, then lowest score.
    opportunities.sort(key=lambda o: (-o.savings_ms, o.score if o.score is not None else 1.0))

    return PageSpeedOut(
        url=payload.url,
        final_url=lh.get("finalUrl") or lh.get("requestedUrl"),
        strategy=payload.strategy,
        fetched=performance_score is not None,
        performance_score=performance_score,
        fcp=fcp,
        lcp=lcp,
        metrics=metrics,
        opportunities=opportunities[:60],
    )
