"""Browser-driven pipeline: each step is a stand-alone function that hydrates
state from Postgres, runs ONE step, and persists results back to Postgres.

The browser orchestrates by calling POST /api/jobs/{id}/step/{name} in order.
No worker, no Redis, no SSE — just stateless serverless steps backed by
the api_cache table (idempotent, cheap on retry).
"""
from __future__ import annotations

import asyncio
import re
from typing import Any
from uuid import UUID

from bs4 import BeautifulSoup
from sqlalchemy import select

from app import cache
from app.audit import log_step
from app.db import SessionLocal
from app.models import Content, Domain, Job, SemanticReport
from app.services import logger as syslog
from app.services import (
    analysis,
    blueprint as blueprint_svc,
    coverage,
    embeddings,
    generator,
    image,
    intent as intent_svc,
    linker,
    parser,
    quality,
    scraper,
    serp,
    term_freq,
)

STEPS = [
    "serp",
    "scrape",
    "parse",
    "analyze",
    "blueprint",
    "generate",
    "image",
    "link",
    "score",
]
PAUSE_AFTER = "blueprint"
MIN_COMPETITORS_OK = 4


# ---------- shared helpers ----------


async def _set_step(job_id: UUID, step: str, status: str) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.current_step = step
        job.status = status
        await session.commit()


async def _add_cost(job_id: UUID, amount: float) -> None:
    if amount <= 0:
        return
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.cost_actual = float(job.cost_actual or 0) + amount
        await session.commit()


async def _record_prompt(
    job_id: UUID,
    step: str,
    *,
    system: str,
    user: str,
    model: str,
    cost: float | None = None,
) -> None:
    """Persist the prompts actually sent to the LLM at this step on Job.prompts.
    Lets the user inspect what got sent in production via /jobs/{id}/prompts."""
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        prompts = dict(job.prompts or {})
        prompts[step] = {
            "system": system,
            "user": user,
            "model": model,
            "cost": cost,
            "system_chars": len(system),
            "user_chars": len(user),
        }
        job.prompts = prompts
        await session.commit()


async def _is_capped(job_id: UUID) -> bool:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return False
        if job.cost_cap is None:
            return False
        return float(job.cost_actual or 0) >= float(job.cost_cap)


async def _finalize(job_id: UUID, *, status: str, error: str | None = None) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.status = status
        job.error = error
        await session.commit()


async def _ensure_report(job_id: UUID) -> SemanticReport:
    async with SessionLocal() as session:
        sr = (
            await session.execute(
                select(SemanticReport).where(SemanticReport.job_id == job_id)
            )
        ).scalar_one_or_none()
        if sr is None:
            sr = SemanticReport(job_id=job_id)
            session.add(sr)
            await session.commit()
            await session.refresh(sr)
        return sr


async def _load_job(job_id: UUID) -> Job:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
    if job is None:
        raise RuntimeError(f"job {job_id} not found")
    return job


async def _load_content(content_id: UUID) -> Content | None:
    async with SessionLocal() as session:
        return await session.get(Content, content_id)


# ---------- public API: run_step ----------


async def run_step(job_id: UUID, step: str) -> dict[str, Any]:
    """Execute ONE pipeline step. Idempotent (cached) and short.

    Returns a small status dict the API layer surfaces to the browser:
      { "ok": True, "step": "...", "next": "..." | None, "paused": bool }
    """
    if step not in STEPS:
        raise ValueError(f"unknown step: {step}")
    if await _is_capped(job_id):
        await _finalize(job_id, status="capped", error="cost cap reached")
        return {"ok": False, "step": step, "next": None, "paused": False, "capped": True}

    await _set_step(job_id, step, "running")
    await log_step(job_id, step, "running")

    handler = _HANDLERS[step]
    try:
        await handler(job_id)
    except Exception as exc:  # noqa: BLE001
        await log_step(job_id, step, "failed", {"error": str(exc)})
        await syslog.error(f"step {step} failed", module="pipeline", job_id=str(job_id), error=str(exc))
        await _finalize(job_id, status="failed", error=f"{step}: {exc}")
        return {"ok": False, "step": step, "error": str(exc)}

    await log_step(job_id, step, "done")

    if await _is_capped(job_id):
        await _finalize(job_id, status="capped", error="cost cap reached")
        return {"ok": False, "step": step, "next": None, "paused": False, "capped": True}

    next_step = _next_step(step)
    paused = False
    if step == PAUSE_AFTER:
        job = await _load_job(job_id)
        # Pause after blueprint when:
        #  - the user asked to validate blueprints manually (and mode != rewrite),
        #  - OR the job is part of a silo (the orchestrator must build the link
        #    manifest BEFORE generate runs).
        needs_pause = (
            (not job.auto_validate_blueprint and job.mode != "rewrite")
            or job.mode == "silo"
        )
        if needs_pause:
            await _set_step(job_id, step, "paused")
            paused = True
            next_step = None

    if next_step is None and not paused:
        await _finalize(job_id, status="done")

    return {"ok": True, "step": step, "next": next_step, "paused": paused}


def _next_step(current: str) -> str | None:
    i = STEPS.index(current)
    return STEPS[i + 1] if i + 1 < len(STEPS) else None


async def reset_for_retry(job_id: UUID) -> None:
    """Clear the previous run state so the job can be re-driven from step 1."""
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        history = list((job.audit or {}).get("retries", []))
        history.append({"previous_steps": (job.audit or {}).get("steps", [])})
        job.audit = {"steps": [], "retries": history}
        job.status = "queued"
        job.error = None
        job.current_step = None
        await session.commit()


# ---------- step handlers (each loads its own state from DB / cache) ----------


async def _step_serp(job_id: UUID) -> None:
    job = await _load_job(job_id)
    serp_result, related = await serp.fetch_serp_and_related(
        job.keyword, job.location_code, job.language_code
    )
    await _add_cost(job_id, serp_result.cost + (serp.RELATED_COST if related else 0))

    # Persist the PARSED SERP fields (organic_top7, paa, features) at top level
    # of serp_raw — that's what _hydrate_serp / _step_scrape expect. Stash the
    # full raw DataForSEO payload under "_dfs" for debugging if ever needed.
    sr = await _ensure_report(job_id)
    async with SessionLocal() as session:
        sr_db = await session.get(SemanticReport, sr.id)
        if sr_db is not None:
            sr_db.serp_raw = {
                "keyword": serp_result.keyword,
                "organic_top7": serp_result.organic_top7,
                "paa": serp_result.paa,
                "features": serp_result.features,
                "_dfs": serp_result.raw,
            }
            sr_db.related_keywords = [r.__dict__ for r in related]
            await session.commit()


async def _step_scrape(job_id: UUID) -> None:
    """Scrape competitor URLs. Re-uses the URL-level api_cache (TTL 72h)."""
    serp_result = await _hydrate_serp(job_id)
    urls = [o["url"] for o in serp_result.get("organic_top7", []) if o.get("url")]
    if not urls:
        raise RuntimeError("no organic URLs from SERP")
    batch = await scraper.scrape_urls(urls, min_success=MIN_COMPETITORS_OK)
    await _add_cost(job_id, batch.cost)
    if len(batch.pages) < MIN_COMPETITORS_OK:
        raise RuntimeError(
            f"scrape tolerance breached: {len(batch.pages)}/{len(urls)} pages OK"
        )
    # Persist scraped pages on the semantic_reports row so the next steps don't
    # need to re-fetch them from cache (and so we have a permanent record).
    sr = await _ensure_report(job_id)
    async with SessionLocal() as session:
        sr_db = await session.get(SemanticReport, sr.id)
        if sr_db is not None:
            payload = (sr_db.serp_raw or {}).copy()
            payload["scraped"] = [
                {
                    "url": p.url,
                    "title": p.title,
                    "markdown": p.markdown,
                    "html": p.html,
                    "source": p.source,
                }
                for p in batch.pages
            ]
            sr_db.serp_raw = payload
            await session.commit()


async def _step_parse(job_id: UUID) -> None:
    pages = await _hydrate_scraped(job_id)
    serp_result = await _hydrate_serp(job_id)

    parsed: list[tuple[parser.ParsedPage, float]] = []
    for raw in pages:
        p = parser.parse_page(raw["url"], raw.get("html"), raw.get("markdown"))
        q = quality.score_competitor(p)
        parsed.append((p, q))

    intent = intent_svc.classify_intent(
        serp_result.get("features", []),
        [o.get("title", "") for o in serp_result.get("organic_top7", [])],
    )

    sr = await _ensure_report(job_id)
    async with SessionLocal() as session:
        sr_db = await session.get(SemanticReport, sr.id)
        if sr_db is not None:
            sr_db.competitors = [
                {
                    "url": p.url,
                    "title": p.title,
                    "h1": p.h1,
                    "h2": p.h2,
                    "h3_count": len(p.h3),
                    "word_count": p.word_count,
                    "paragraphs_count": len(p.paragraphs),
                    "lists_count": p.lists_count,
                    "tables_count": p.tables_count,
                    "images_with_alt": p.images_with_alt,
                    "images_without_alt": p.images_without_alt,
                    "has_faq_schema": p.has_faq_schema,
                    "has_article_schema": p.has_article_schema,
                    "has_product_schema": p.has_product_schema,
                    "author": p.author,
                    "quality": q,
                }
                for p, q in parsed
            ]
            await session.commit()
        # Persist intent on content for downstream steps
        job = await session.get(Job, job_id)
        if job and job.content_id:
            content = await session.get(Content, job.content_id)
            if content:
                content.intent = intent
                await session.commit()


async def _step_analyze(job_id: UUID) -> None:
    job = await _load_job(job_id)
    content = await _load_content(job.content_id) if job.content_id else None
    parsed_payload = await _hydrate_parsed(job_id)
    related = await _hydrate_related(job_id)
    intent = (content.intent if content else None) or "informational"

    parsed: list[tuple[parser.ParsedPage, float]] = []
    for c in parsed_payload:
        p = parser.ParsedPage(
            url=c.get("url", ""),
            title=c.get("title"),
            h1=c.get("h1"),
            h2=list(c.get("h2") or []),
            word_count=int(c.get("word_count") or 0),
            tables_count=int(c.get("tables") or 0),
            has_faq_schema=bool(c.get("has_faq_schema")),
        )
        parsed.append((p, float(c.get("quality") or 0)))

    cap: dict = {}
    report = await analysis.semantic_report(
        keyword=job.keyword,
        intent=intent,
        parsed=parsed,
        related=related,
        capture=cap,
    )
    await _add_cost(job_id, report.llm_cost)
    if cap:
        await _record_prompt(job_id, "analyze", **cap)

    expected_text = " ; ".join(report.required_terms[:50] + report.entities[:20])
    expected_vec: list[float] | None = None
    if expected_text.strip():
        vecs = await embeddings.embed([expected_text])
        expected_vec = vecs[0] if vecs else None

    competitor_texts = [p.get("markdown", "") for p in await _hydrate_scraped(job_id)]
    # Headings carry the strongest editorial signal: any candidate term that
    # surfaces in any competitor's H1/H2 gets a 1.4× heading boost in BM25.
    headings_text = " . ".join(
        " ".join(filter(None, [c.get("h1") or ""] + list(c.get("h2") or [])))
        for c in parsed_payload
    )
    targets = term_freq.compute_term_targets(
        competitor_texts,
        keyword=job.keyword,
        headings_text=headings_text,
        top_n=40,
    )

    sr = await _ensure_report(job_id)
    async with SessionLocal() as session:
        sr_db = await session.get(SemanticReport, sr.id)
        if sr_db is not None:
            sr_db.common_subthemes = report.common_subthemes
            sr_db.rare_subthemes = report.rare_subthemes
            sr_db.entities = report.entities
            sr_db.required_terms = report.required_terms
            sr_db.content_gaps = report.content_gaps
            sr_db.term_targets = [t.to_dict() for t in targets]
            if expected_vec is not None:
                sr_db.expected_terms_embedding = expected_vec
            await session.commit()


async def _step_blueprint(job_id: UUID) -> None:
    job = await _load_job(job_id)
    sr = await _ensure_report(job_id)
    content = await _load_content(job.content_id) if job.content_id else None
    intent = (content.intent if content else None) or "informational"

    # In rewrite mode, no need for a full structural blueprint — we just need a
    # target_words derived from the source content. The rewrite prompt drives
    # the structure itself.
    if job.mode == "rewrite":
        source_words = len((job.source_content or "").split())
        target = max(int(source_words * 1.15), 800)
        if content is not None:
            async with SessionLocal() as session:
                c = await session.get(Content, content.id)
                if c is not None:
                    c.blueprint = {"target_words": target, "mode": "rewrite"}
                    if not c.intent:
                        c.intent = intent
                    await session.commit()
        return

    # Re-construct a SemanticReport view for blueprint_svc.build_blueprint
    fake_report = analysis.SemanticReport(
        common_subthemes=list(sr.common_subthemes or []),
        rare_subthemes=list(sr.rare_subthemes or []),
        entities=list(sr.entities or []),
        required_terms=list(sr.required_terms or []),
        content_gaps=list(sr.content_gaps or []),
        structural_signals={},
        llm_cost=0.0,
    )
    cap_bp: dict = {}
    bp = await blueprint_svc.build_blueprint(
        keyword=job.keyword,
        intent=intent,
        content_type=job.content_type,
        report=fake_report,
        term_targets=list(sr.term_targets or []),
        capture=cap_bp,
    )
    await _add_cost(job_id, bp.llm_cost)
    if cap_bp:
        await _record_prompt(job_id, "blueprint", **cap_bp)

    if content is not None:
        async with SessionLocal() as session:
            db_content = await session.get(Content, content.id)
            if db_content:
                db_content.blueprint = bp.to_dict()
                if not db_content.intent:
                    db_content.intent = intent
                await session.commit()


async def _step_generate(job_id: UUID) -> None:
    job = await _load_job(job_id)
    content = await _load_content(job.content_id) if job.content_id else None
    if content is None:
        raise RuntimeError("missing content row")

    intent = content.intent or "informational"
    sr = await _ensure_report(job_id)
    required = list(sr.required_terms or [])
    entities = list(sr.entities or [])
    gaps = list(sr.content_gaps or [])
    term_targets = list(sr.term_targets or [])
    domain_host = await _load_domain_host(job.domain_id) if job.domain_id else None

    if job.mode == "rewrite":
        # Rewrite-with-context flow: take the source content + SERP insights
        from app.services import rewrite as rewrite_svc
        source_html = job.source_content or ""
        target_words = (content.blueprint or {}).get("target_words", 1500)
        cap_gen: dict = {}
        result = await rewrite_svc.rewrite_with_context(
            keyword=job.keyword,
            intent=intent,
            domain=domain_host,
            target_words=target_words,
            source_html=source_html,
            required_terms=required,
            entities=entities,
            content_gaps=gaps,
            term_targets=term_targets,
            capture=cap_gen,
        )
        title_variants = result.title_variants
        html = result.html
        schema_recos = result.schema_recommendations
        image_prompt = result.image_prompt
        cost = result.cost
    else:
        blueprint_dict: dict = content.blueprint or {}
        if not blueprint_dict:
            raise RuntimeError("blueprint not yet computed")
        # Silo: a link_manifest persisted on the content row drives the strict
        # internal mesh rules injected into the prompt.
        link_manifest = content.link_manifest if job.mode == "silo" else None
        if job.mode == "silo" and not link_manifest:
            raise RuntimeError(
                "silo job: link_manifest missing — call /srv/silos/{id}/manifest first"
            )
        cap_gen = {}
        generated = await generator.generate_content(
            keyword=job.keyword,
            intent=intent,
            content_type=job.content_type,
            domain=domain_host,
            blueprint=blueprint_dict,
            required_terms=required,
            entities=entities,
            content_gaps=gaps,
            term_targets=term_targets,
            use_haiku=getattr(job, "use_haiku", False),
            link_manifest=link_manifest,
            capture=cap_gen,
        )
        title_variants = generated.title_variants
        html = generated.html
        schema_recos = generated.schema_recommendations
        image_prompt = generated.image_prompt or _quick_image_prompt(blueprint_dict)
        cost = generated.llm_cost

    await _add_cost(job_id, cost)
    if cap_gen:
        await _record_prompt(job_id, "generate", **cap_gen)

    async with SessionLocal() as session:
        c = await session.get(Content, content.id)
        if c is not None:
            c.title_variants = title_variants
            if title_variants:
                c.chosen_title = title_variants[0].get("title")
                c.chosen_meta = title_variants[0].get("meta")
            c.html = html
            c.markdown = _html_to_markdown(html)
            c.schema_recommendations = schema_recos
            c.image_prompt = image_prompt
            c.status = "generated"
            embed_text = (c.chosen_title or "") + " " + (c.keyword or "")
            if embed_text.strip():
                vecs = await embeddings.embed([embed_text])
                if vecs:
                    c.embedding = vecs[0]
            await session.commit()


async def _step_image(job_id: UUID) -> None:
    """Image step is opt-in. Default: do nothing — the prompt is stored on
    contents.image_prompt and the user generates the image manually (or
    triggers OpenAI/DALL-E from the content page if they want).

    If a job has generate_image=True, fall back to the configured image
    backend (Fal.ai or OpenAI). For now, always skip — the user will
    drive image generation from the editor side."""
    job = await _load_job(job_id)
    if not getattr(job, "generate_image", False):
        await log_step(job_id, "image", "skipped", {"reason": "image opt-in"})
        return
    content = await _load_content(job.content_id) if job.content_id else None
    if content is None or not content.image_prompt:
        return
    img = await image.generate_image(content.image_prompt)
    await _add_cost(job_id, img.cost)
    async with SessionLocal() as session:
        c = await session.get(Content, content.id)
        if c is not None and img.url:
            c.image_url = img.url
            await session.commit()


async def _step_link(job_id: UUID) -> None:
    job = await _load_job(job_id)
    if not job.internal_linking:
        await log_step(job_id, "link", "skipped", {"reason": "internal_linking disabled"})
        return
    if not job.domain_id:
        await log_step(job_id, "link", "skipped", {"reason": "no domain selected"})
        return
    content = await _load_content(job.content_id) if job.content_id else None
    if content is None or not content.html:
        await log_step(job_id, "link", "skipped", {"reason": "no content html"})
        return

    async with SessionLocal() as session:
        suggestions = await linker.suggest_links(
            session,
            content_html=content.html,
            content_id=content.id,
            domain_id=job.domain_id,
        )
    new_html = linker.insert_links(content.html, suggestions)

    async with SessionLocal() as session:
        c = await session.get(Content, content.id)
        if c is not None:
            c.html = new_html
            c.markdown = _html_to_markdown(new_html)
            c.internal_links = [
                {
                    "section_id": s.section_id,
                    "anchor": s.anchor,
                    "target_url": s.target_url,
                    "target_title": s.target_title,
                    "similarity": s.similarity,
                }
                for s in suggestions
            ]
            await session.commit()


async def _step_score(job_id: UUID) -> None:
    job = await _load_job(job_id)
    content = await _load_content(job.content_id) if job.content_id else None
    if content is None or not content.html:
        return

    async with SessionLocal() as session:
        sr = (
            await session.execute(
                select(SemanticReport).where(SemanticReport.job_id == job_id)
            )
        ).scalar_one_or_none()
        expected_terms = list(sr.required_terms or []) if sr else []

    plain = BeautifulSoup(content.html, "html.parser").get_text(" ", strip=True)
    score = await coverage.coverage_score(expected_terms=expected_terms, content_text=plain)

    async with SessionLocal() as session:
        c = await session.get(Content, content.id)
        if c is not None:
            c.coverage_score = score
            c.status = "editing"
            await session.commit()


_HANDLERS = {
    "serp": _step_serp,
    "scrape": _step_scrape,
    "parse": _step_parse,
    "analyze": _step_analyze,
    "blueprint": _step_blueprint,
    "generate": _step_generate,
    "image": _step_image,
    "link": _step_link,
    "score": _step_score,
}


# ---------- DB hydration helpers ----------


async def _hydrate_serp(job_id: UUID) -> dict:
    sr = await _ensure_report(job_id)
    return sr.serp_raw or {}


async def _hydrate_scraped(job_id: UUID) -> list[dict]:
    sr = await _ensure_report(job_id)
    return list((sr.serp_raw or {}).get("scraped", []) or [])


async def _hydrate_parsed(job_id: UUID) -> list[dict]:
    sr = await _ensure_report(job_id)
    return list(sr.competitors or [])


async def _hydrate_related(job_id: UUID) -> list[str]:
    sr = await _ensure_report(job_id)
    raw = list(sr.related_keywords or [])
    return [r["keyword"] for r in raw if r.get("keyword")]


async def _load_domain_host(domain_id: UUID) -> str | None:
    async with SessionLocal() as session:
        d = await session.get(Domain, domain_id)
        return d.hostname if d else None


def _quick_image_prompt(blueprint: dict) -> str:
    angle = blueprint.get("angle") or ""
    title = blueprint.get("title_target") or ""
    return f"Photo éditoriale moderne et lumineuse illustrant {title}. Angle : {angle}".strip()


def _html_to_markdown(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    out: list[str] = []
    for el in soup.descendants:
        if not getattr(el, "name", None):
            continue
        name = el.name
        if name == "h1":
            out.append(f"\n# {el.get_text(strip=True)}\n")
        elif name == "h2":
            out.append(f"\n## {el.get_text(strip=True)}\n")
        elif name == "h3":
            out.append(f"\n### {el.get_text(strip=True)}\n")
        elif name == "p":
            out.append(el.get_text(" ", strip=True) + "\n")
        elif name == "li":
            out.append(f"- {el.get_text(' ', strip=True)}")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()
