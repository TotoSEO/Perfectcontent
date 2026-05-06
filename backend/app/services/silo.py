"""Silo orchestration: pillar + N satellites with strict internal mesh.

Lifecycle (browser-driven, like the rest of the pipeline):

  1. POST /srv/silos                   -> creates silo + N(+1) contents + jobs.
                                          Each job runs its own pipeline up to
                                          'blueprint' (auto-validate ON).
  2. POST /srv/silos/{id}/manifest     -> once every member's blueprint is done,
                                          compute pairwise cosine and persist a
                                          link_manifest on each member.
  3. Browser triggers 'generate' on satellite jobs in parallel, then on the
     pillar job last. The generator picks up link_manifest from contents and
     enforces the mesh in its prompt.
  4. POST /srv/silos/{id}/validate     -> parse the resulting HTML of every
                                          member, count actual links per pair,
                                          check pillar-link position, persist a
                                          full mesh_audit.

Mesh policy (from product spec):
- Pillar -> EVERY satellite, exactly 1 contextual link, in the intro paragraph
  of that satellite's sub-section on the pillar page.
- Satellite -> pillar (or pillar_external_url), exactly 1 link, MUST appear in
  the article's first 3 <p> elements (intro / first paragraphs).
- Satellite -> other satellites: as many as semantically natural, BUT 1 max
  per (source, target) pair. The manifest ranks peers by cosine and tells the
  LLM which are the most relevant ones.
- Anchors must be contextual, varied, never "consultez notre article".
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import Content, Job, Silo
from app.services import embeddings
from app.services.slug import join_url, slugify


# ---------------------------------------------------------------------------
# Planning (create silo + members)
# ---------------------------------------------------------------------------

@dataclass
class SiloMemberSpec:
    keyword: str
    slug: str | None = None  # auto-derived from keyword if missing


@dataclass
class SiloPlan:
    base_url: str
    trailing_slash: bool
    pillar_keyword: str | None
    pillar_external_url: str | None  # if set, no pillar content is generated
    satellites: list[SiloMemberSpec]
    domain_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    location_code: int = 2250
    language_code: str = "fr"
    use_haiku: bool = False
    generate_image: bool = False
    do_refinement: bool = False
    do_schema_jsonld: bool = False
    cost_cap: float | None = None


async def create_silo(db: AsyncSession, plan: SiloPlan) -> tuple[Silo, list[Job]]:
    """Create the silo row, the N(+1) contents and their jobs. Each job is
    set up so the existing pipeline runs SERP -> blueprint with auto-validate.
    The browser triggers generate later, after manifest is built.

    Optimized to 2 DB round-trips:
      1. INSERT silo + all contents in one flush() so we get their IDs
      2. INSERT all jobs (referencing content_id) and silo.pillar_content_id
         then commit()
    Previously this did 1 + (N+1) flushes = up to 7+ round-trips, which on
    Supabase EU ↔ Vercel US (~150ms each) blew past the 10s default function
    timeout for medium silos.
    """
    if not plan.satellites:
        raise ValueError("a silo needs at least one satellite")
    has_pillar = bool(plan.pillar_keyword) and not plan.pillar_external_url

    batch_id = uuid.uuid4()
    silo = Silo(
        name=plan.pillar_keyword or plan.pillar_external_url,
        pillar_keyword=plan.pillar_keyword if has_pillar else None,
        pillar_external_url=plan.pillar_external_url,
        base_url=plan.base_url,
        trailing_slash=plan.trailing_slash,
        domain_id=plan.domain_id,
        folder_id=plan.folder_id,
        batch_id=batch_id,
        status="blueprinting",
    )
    db.add(silo)
    # Round-trip #1: flush the silo so silo.id exists, then bulk-add contents.
    await db.flush()

    contents: list[Content] = []
    pillar_content: Content | None = None
    if has_pillar:
        pillar_content = Content(
            folder_id=plan.folder_id,
            domain_id=plan.domain_id,
            keyword=plan.pillar_keyword,
            content_type="blog",
            status="analysis",
            silo_id=silo.id,
            silo_role="pillar",
            slug=slugify(plan.pillar_keyword or ""),
        )
        contents.append(pillar_content)
    for spec in plan.satellites:
        contents.append(
            Content(
                folder_id=plan.folder_id,
                domain_id=plan.domain_id,
                keyword=spec.keyword,
                content_type="blog",
                status="analysis",
                silo_id=silo.id,
                silo_role="satellite",
                slug=spec.slug or slugify(spec.keyword),
            )
        )
    db.add_all(contents)
    await db.flush()  # round-trip #2: all content.id are now populated

    # Wire pillar_content_id back on the silo (we have the ID now)
    if pillar_content is not None:
        silo.pillar_content_id = pillar_content.id

    # Build all jobs now that content.id exists
    jobs: list[Job] = [_make_job(c, plan, batch_id, "blog") for c in contents]
    db.add_all(jobs)
    await db.commit()  # round-trip #3 (final write)
    for j in jobs:
        await db.refresh(j)
    await db.refresh(silo)
    return silo, jobs


def _make_job(content: Content, plan: SiloPlan, batch_id: uuid.UUID, content_type: str) -> Job:
    return Job(
        content_id=content.id,
        keyword=content.keyword,
        content_type=content_type,
        location_code=plan.location_code,
        language_code=plan.language_code,
        domain_id=plan.domain_id,
        internal_linking=False,  # silo handles its OWN linking; external indexer linker stays off
        generate_image=plan.generate_image,
        use_haiku=plan.use_haiku,
        auto_validate_blueprint=True,  # silo runs unattended through blueprint
        batch_id=batch_id,
        mode="silo",
        status="queued",
        cost_cap=plan.cost_cap,
        audit={"steps": []},
        do_refinement=plan.do_refinement,
        do_schema_jsonld=plan.do_schema_jsonld,
    )


# ---------------------------------------------------------------------------
# Manifest building (after all blueprints are done)
# ---------------------------------------------------------------------------

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _topic_hint(content: Content) -> str:
    """One-line description of what THIS member talks about, fed to peers
    as guidance ('here's what this article covers — link to it when your text
    naturally mentions this topic')."""
    bp = content.blueprint or {}
    pieces: list[str] = []
    if bp.get("title_target"):
        pieces.append(str(bp["title_target"]))
    elif content.keyword:
        pieces.append(content.keyword)
    if bp.get("angle"):
        pieces.append(str(bp["angle"]))
    return " — ".join(pieces).strip()[:240]


def _member_url(silo: Silo, content: Content) -> str:
    return join_url(silo.base_url, content.slug or "", trailing_slash=silo.trailing_slash)


async def build_manifest(db: AsyncSession, silo_id: uuid.UUID) -> dict[str, Any]:
    """Compute and persist the link manifest on every member content row."""
    silo = await db.get(Silo, silo_id)
    if silo is None:
        raise ValueError("silo not found")
    members = list(
        (
            await db.execute(select(Content).where(Content.silo_id == silo_id))
        ).scalars().all()
    )
    if not members:
        raise ValueError("silo has no members")
    # Need every member to have a blueprint
    missing = [m.id for m in members if not m.blueprint]
    if missing:
        raise ValueError(f"{len(missing)} member(s) without blueprint yet")

    # Embed each member's topic hint
    hints = [_topic_hint(m) or m.keyword or "" for m in members]
    vecs = await embeddings.embed(hints)

    # Index members
    pillar = next((m for m in members if m.silo_role == "pillar"), None)
    satellites = [m for m in members if m.silo_role == "satellite"]
    sat_index = {m.id: i for i, m in enumerate(members) if m.silo_role == "satellite"}
    pillar_url = (
        silo.pillar_external_url or (_member_url(silo, pillar) if pillar else None)
    )
    if not pillar_url:
        raise ValueError("silo has neither pillar content nor external pillar URL")

    # Build per-member manifest
    for i, m in enumerate(members):
        mvec = vecs[i] if i < len(vecs) else []
        if m.silo_role == "pillar":
            sat_links = []
            for s in satellites:
                j = sat_index[s.id]
                sat_links.append({
                    "url": _member_url(silo, s),
                    "topic": _topic_hint(s),
                    "keyword": s.keyword,
                    "similarity": round(_cosine(mvec, vecs[j]), 3) if j < len(vecs) else 0.0,
                })
            m.link_manifest = {
                "role": "pillar",
                "pillar_url": pillar_url,
                "satellite_links": sat_links,
            }
        else:  # satellite
            peers = []
            for s in satellites:
                if s.id == m.id:
                    continue
                j = sat_index[s.id]
                sim = _cosine(mvec, vecs[j]) if j < len(vecs) else 0.0
                peers.append({
                    "url": _member_url(silo, s),
                    "topic": _topic_hint(s),
                    "keyword": s.keyword,
                    "similarity": round(sim, 3),
                })
            peers.sort(key=lambda p: -p["similarity"])
            m.link_manifest = {
                "role": "satellite",
                "pillar_url": pillar_url,
                "peer_links": peers,
            }
    silo.status = "generating"
    await db.commit()
    return {"ok": True, "members": len(members)}


# ---------------------------------------------------------------------------
# Mesh validation (after all generations are done)
# ---------------------------------------------------------------------------

def _normalize(url: str) -> str:
    """Canonicalize URL for matching: drop trailing slash, lower scheme/host."""
    try:
        u = urlparse(url)
        host = (u.netloc or "").lower()
        path = (u.path or "").rstrip("/")
        return f"{u.scheme.lower()}://{host}{path}".rstrip("/")
    except Exception:
        return url.rstrip("/")


def _links_in_html(html: str) -> list[tuple[str, str, int]]:
    """Return (href, anchor_text, paragraph_index_or_-1) for every <a href>.

    paragraph_index counts <p> elements containing the anchor; -1 if the
    anchor lives outside any <p> (e.g. inside <li>, <td>)."""
    soup = BeautifulSoup(html or "", "html.parser")
    out: list[tuple[str, str, int]] = []
    paragraphs = soup.find_all("p")
    p_to_idx = {id(p): idx for idx, p in enumerate(paragraphs)}
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        anchor = a.get_text(" ", strip=True)
        # Find enclosing <p>
        p_idx = -1
        cur = a.parent
        while cur is not None:
            if id(cur) in p_to_idx:
                p_idx = p_to_idx[id(cur)]
                break
            cur = getattr(cur, "parent", None)
        out.append((href, anchor, p_idx))
    return out


async def validate_mesh(db: AsyncSession, silo_id: uuid.UUID) -> dict[str, Any]:
    silo = await db.get(Silo, silo_id)
    if silo is None:
        raise ValueError("silo not found")
    members = list(
        (
            await db.execute(select(Content).where(Content.silo_id == silo_id))
        ).scalars().all()
    )
    if not members:
        return {"ok": True, "mesh": [], "summary": {}}

    # Build URL -> member index for quick "who points at whom"
    members_by_url: dict[str, Content] = {}
    for m in members:
        members_by_url[_normalize(_member_url(silo, m))] = m
    pillar = next((m for m in members if m.silo_role == "pillar"), None)
    pillar_url = silo.pillar_external_url or (_member_url(silo, pillar) if pillar else None)
    pillar_url_norm = _normalize(pillar_url or "")

    issues: list[dict] = []
    rows: list[dict] = []
    for m in members:
        manifest = m.link_manifest or {}
        links = _links_in_html(m.html or "")
        # Map normalized href -> [(anchor, p_idx)]
        by_target: dict[str, list[tuple[str, int]]] = {}
        for href, anchor, p_idx in links:
            n = _normalize(href)
            if not n:
                continue
            by_target.setdefault(n, []).append((anchor, p_idx))

        member_row = {
            "content_id": str(m.id),
            "role": m.silo_role,
            "url": _member_url(silo, m),
            "title": m.chosen_title or m.keyword,
            "expected": [],
            "issues": [],
        }

        if m.silo_role == "satellite":
            # Pillar link: present, exactly once, in first 3 <p>
            count = len(by_target.get(pillar_url_norm, []))
            positions = [p for _, p in by_target.get(pillar_url_norm, [])]
            ok = (count >= 1) and any(0 <= p < 3 for p in positions)
            entry = {
                "target_url": pillar_url,
                "kind": "pillar",
                "count": count,
                "first_position": min(positions, default=None),
                "ok": bool(ok),
            }
            member_row["expected"].append(entry)
            if not ok:
                if count == 0:
                    member_row["issues"].append("pillar link missing")
                elif not any(0 <= p < 3 for p in positions):
                    member_row["issues"].append("pillar link not in first 3 paragraphs")
            # Peer links: at MOST 1 per peer, no duplicates
            for peer in (manifest.get("peer_links") or []):
                purl = _normalize(peer.get("url", ""))
                cnt = len(by_target.get(purl, []))
                ok_peer = cnt <= 1
                member_row["expected"].append({
                    "target_url": peer.get("url"),
                    "kind": "peer",
                    "count": cnt,
                    "ok": bool(ok_peer),
                    "similarity": peer.get("similarity"),
                })
                if cnt > 1:
                    member_row["issues"].append(f"duplicate peer link: {peer.get('url')}")
        elif m.silo_role == "pillar":
            # Pillar must point at every satellite, 1 link each
            for sat in (manifest.get("satellite_links") or []):
                surl = _normalize(sat.get("url", ""))
                cnt = len(by_target.get(surl, []))
                ok = cnt == 1
                member_row["expected"].append({
                    "target_url": sat.get("url"),
                    "kind": "satellite",
                    "count": cnt,
                    "ok": bool(ok),
                })
                if cnt == 0:
                    member_row["issues"].append(f"missing satellite link: {sat.get('url')}")
                elif cnt > 1:
                    member_row["issues"].append(f"duplicate satellite link: {sat.get('url')}")

        if member_row["issues"]:
            issues.extend(member_row["issues"])
        rows.append(member_row)

    summary = {
        "members": len(rows),
        "issues": len(issues),
        "all_ok": len(issues) == 0,
    }
    silo.mesh_audit = {"rows": rows, "summary": summary}
    silo.status = "done" if summary["all_ok"] else "partial"
    await db.commit()
    return {"ok": summary["all_ok"], "summary": summary, "rows": rows}
