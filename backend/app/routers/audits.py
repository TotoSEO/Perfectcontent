from __future__ import annotations

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


class SitemapInfo(BaseModel):
    fetched: bool
    url_count: int | None = None
    nested_count: int = 0
    duplicates: int = 0
    reference_in_robots: bool = False


class LlmsTxtInfo(BaseModel):
    fetched: bool
    size_bytes: int | None = None


class SiteResourcesOut(BaseModel):
    origin: str
    robots_txt: RobotsTxtInfo
    sitemap_xml: SitemapInfo
    llms_txt: LlmsTxtInfo


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
                robots = RobotsTxtInfo(
                    fetched=True,
                    size_bytes=len(robots_text.encode("utf-8")),
                    lines=len(lines),
                    has_sitemap_ref=bool(sitemap_url_candidates),
                    user_agents=user_agents,
                    disallow_count=disallow,
                    allow_count=allow,
                    raw_preview=robots_text[:600],
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
                llms = LlmsTxtInfo(fetched=True, size_bytes=len(r.text.encode("utf-8")))
        except httpx.HTTPError:
            pass

    return SiteResourcesOut(origin=origin, robots_txt=robots, sitemap_xml=sitemap, llms_txt=llms)


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
        "et tu termines sur une recommandation d'ordre de chantier (quick-wins puis chantiers de fond). "
        "Style : direct, factuel, sans superlatifs, sans bullet points, sans titres."
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
