"""Pipeline orchestrator: state machine, idempotent steps, hard cap, audit, SSE events."""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from uuid import UUID

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_step
from app.cache import get_redis
from app.db import SessionLocal
from app.models import Content, Domain, Job, SemanticReport
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


async def _publish(job_id: UUID, payload: dict) -> None:
    r = get_redis()
    data = json.dumps(payload, default=str)
    await r.set(f"pc:job:{job_id}:state", data, ex=3600)
    await r.publish(f"pc:job:{job_id}:events", data)


async def _is_cancelled(job_id: UUID) -> bool:
    return bool(await get_redis().get(f"pc:job:{job_id}:cancel"))


async def run_pipeline(job_id: UUID, *, from_step: str | None = None) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.status = "running"
        if from_step is None:
            job.current_step = STEPS[0]
        else:
            job.current_step = from_step
        await session.commit()

    start_index = STEPS.index(from_step) if from_step else 0
    state: dict[str, Any] = {}

    try:
        for step in STEPS[start_index:]:
            if await _is_cancelled(job_id):
                await _finalize(job_id, status="failed", error="cancelled by user")
                return
            await _set_step(job_id, step)
            await log_step(job_id, step, "running")
            await _publish(job_id, {"status": "running", "step": step})

            handler = _HANDLERS[step]
            await handler(job_id, state)

            if not await _check_cap(job_id):
                await _finalize(job_id, status="capped", error="cost cap reached")
                return

            await log_step(job_id, step, "done")

            if step == PAUSE_AFTER and not state.get("blueprint_validated"):
                async with SessionLocal() as session:
                    job = await session.get(Job, job_id)
                    if job is None:
                        return
                    job.status = "paused"
                    await session.commit()
                await _publish(job_id, {"status": "paused", "step": step})
                return

        await _finalize(job_id, status="done")
    except Exception as exc:  # noqa: BLE001
        await log_step(job_id, "error", "failed", {"error": str(exc)})
        await _finalize(job_id, status="failed", error=str(exc))


async def resume_pipeline(job_id: UUID, from_step: str = "generate") -> None:
    # Mark blueprint as validated so we don't pause again
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.status = "running"
        await session.commit()

    state: dict[str, Any] = {"blueprint_validated": True}
    await _hydrate_state_from_db(job_id, state)
    try:
        start = STEPS.index(from_step)
        for step in STEPS[start:]:
            if await _is_cancelled(job_id):
                await _finalize(job_id, status="failed", error="cancelled by user")
                return
            await _set_step(job_id, step)
            await log_step(job_id, step, "running")
            await _publish(job_id, {"status": "running", "step": step})
            await _HANDLERS[step](job_id, state)
            if not await _check_cap(job_id):
                await _finalize(job_id, status="capped", error="cost cap reached")
                return
            await log_step(job_id, step, "done")
        await _finalize(job_id, status="done")
    except Exception as exc:  # noqa: BLE001
        await log_step(job_id, "error", "failed", {"error": str(exc)})
        await _finalize(job_id, status="failed", error=str(exc))


async def _set_step(job_id: UUID, step: str) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.current_step = step
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


async def _check_cap(job_id: UUID) -> bool:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return False
        if job.cost_cap is None:
            return True
        return float(job.cost_actual or 0) < float(job.cost_cap)


async def _finalize(job_id: UUID, *, status: str, error: str | None = None) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return
        job.status = status
        job.error = error
        await session.commit()
    await get_redis().delete(f"pc:job:{job_id}:cancel")
    await _publish(job_id, {"status": status, "error": error})


async def _get_job(session: AsyncSession, job_id: UUID) -> Job:
    job = await session.get(Job, job_id)
    if job is None:
        raise RuntimeError(f"job {job_id} not found")
    return job


# ---------- Step handlers ----------

async def _step_serp(job_id: UUID, state: dict) -> None:
    async with SessionLocal() as session:
        job = await _get_job(session, job_id)
        keyword, loc, lang = job.keyword, job.location_code, job.language_code

    serp_result, related = await serp.fetch_serp_and_related(keyword, loc, lang)
    state["serp"] = serp_result
    state["related"] = related
    await _add_cost(job_id, serp_result.cost + (serp.RELATED_COST if related else 0))

    async with SessionLocal() as session:
        job = await _get_job(session, job_id)
        report = SemanticReport(
            job_id=job.id,
            serp_raw=serp_result.raw,
            related_keywords=[r.__dict__ for r in related],
        )
        session.add(report)
        await session.commit()
        state["report_id"] = report.id


async def _step_scrape(job_id: UUID, state: dict) -> None:
    serp_result = state["serp"]
    urls = [o["url"] for o in serp_result.organic_top7 if o.get("url")]
    batch = await scraper.scrape_urls(urls, min_success=MIN_COMPETITORS_OK)
    state["scraped"] = batch
    await _add_cost(job_id, batch.cost)
    if len(batch.pages) < MIN_COMPETITORS_OK:
        raise RuntimeError(
            f"scrape tolerance breached: {len(batch.pages)}/{len(urls)} pages OK"
        )


async def _step_parse(job_id: UUID, state: dict) -> None:  # noqa: ARG001
    batch = state["scraped"]
    parsed: list[tuple[parser.ParsedPage, float]] = []
    for raw in batch.pages:
        p = parser.parse_page(raw.url, raw.html, raw.markdown)
        q = quality.score_competitor(p)
        parsed.append((p, q))
    state["parsed"] = parsed

    serp_result = state["serp"]
    intent = intent_svc.classify_intent(
        serp_result.features, [o.get("title", "") for o in serp_result.organic_top7]
    )
    state["intent"] = intent

    async with SessionLocal() as session:
        report = await session.get(SemanticReport, state["report_id"])
        if report is not None:
            report.competitors = [
                {
                    "url": p.url,
                    "title": p.title,
                    "h1": p.h1,
                    "h2": p.h2,
                    "word_count": p.word_count,
                    "tables": p.tables_count,
                    "has_faq_schema": p.has_faq_schema,
                    "quality": q,
                }
                for p, q in parsed
            ]
            await session.commit()


async def _step_analyze(job_id: UUID, state: dict) -> None:
    report = await analysis.semantic_report(
        keyword=state["serp"].keyword,
        intent=state["intent"],
        parsed=state["parsed"],
        related=[r.keyword for r in state["related"]],
    )
    state["analysis"] = report
    await _add_cost(job_id, report.llm_cost)

    # Persist + embed expected terms for coverage scoring later
    expected_text = " ; ".join(report.required_terms[:50] + report.entities[:20])
    expected_vec: list[float] | None = None
    if expected_text.strip():
        vecs = await embeddings.embed([expected_text])
        expected_vec = vecs[0] if vecs else None
    async with SessionLocal() as session:
        sr = await session.get(SemanticReport, state["report_id"])
        if sr is not None:
            sr.common_subthemes = report.common_subthemes
            sr.rare_subthemes = report.rare_subthemes
            sr.entities = report.entities
            sr.required_terms = report.required_terms
            sr.content_gaps = report.content_gaps
            if expected_vec is not None:
                sr.expected_terms_embedding = expected_vec
            await session.commit()


async def _step_blueprint(job_id: UUID, state: dict) -> None:
    job = await _load_job(job_id)
    bp = await blueprint_svc.build_blueprint(
        keyword=job.keyword,
        intent=state["intent"],
        content_type=job.content_type,
        report=state["analysis"],
    )
    state["blueprint"] = bp
    await _add_cost(job_id, bp.llm_cost)

    async with SessionLocal() as session:
        if job.content_id:
            content = await session.get(Content, job.content_id)
            if content is not None:
                content.blueprint = bp.to_dict()
                content.intent = state["intent"]
                await session.commit()


async def _step_generate(job_id: UUID, state: dict) -> None:
    job = await _load_job(job_id)
    content = await _load_content(job.content_id)
    if content is None:
        raise RuntimeError("missing content row")

    blueprint_dict: dict
    if content.blueprint:
        blueprint_dict = content.blueprint
    elif "blueprint" in state:
        blueprint_dict = state["blueprint"].to_dict()
    else:
        blueprint_dict = {}
    intent = content.intent or state.get("intent", "informational")

    if "analysis" in state:
        report = state["analysis"]
        required = report.required_terms
        entities = report.entities
        gaps = report.content_gaps
    else:
        required, entities, gaps = await _load_report_terms(job_id)

    domain_host = await _load_domain_host(job.domain_id) if job.domain_id else None

    gen_task = generator.generate_content(
        keyword=job.keyword,
        intent=intent,
        content_type=job.content_type,
        domain=domain_host,
        blueprint=blueprint_dict,
        required_terms=required,
        entities=entities,
        content_gaps=gaps,
    )
    image_prompt = _quick_image_prompt(blueprint_dict)
    image_task = image.generate_image(image_prompt)

    generated, img = await asyncio.gather(gen_task, image_task)
    state["generated"] = generated
    state["image"] = img
    await _add_cost(job_id, generated.llm_cost + img.cost)

    async with SessionLocal() as session:
        content_db = await session.get(Content, job.content_id)
        if content_db is not None:
            content_db.title_variants = generated.title_variants
            if generated.title_variants:
                content_db.chosen_title = generated.title_variants[0].get("title")
                content_db.chosen_meta = generated.title_variants[0].get("meta")
            content_db.html = generated.html
            content_db.markdown = _html_to_markdown(generated.html)
            content_db.schema_recommendations = generated.schema_recommendations
            content_db.image_url = img.url
            content_db.image_prompt = generated.image_prompt or image_prompt
            content_db.status = "generated"
            # Embed for cannibalization / cross-linking
            embed_text = (content_db.chosen_title or "") + " " + (content_db.keyword or "")
            if embed_text.strip():
                vecs = await embeddings.embed([embed_text])
                if vecs:
                    content_db.embedding = vecs[0]
            await session.commit()


async def _step_image(job_id: UUID, state: dict) -> None:
    # Image is generated in the `generate` step in parallel; this is a no-op
    # unless we ever decouple them. Kept for symmetry with the documented pipeline.
    return


async def _step_link(job_id: UUID, state: dict) -> None:
    job = await _load_job(job_id)
    if not job.internal_linking or not job.domain_id:
        return
    content = await _load_content(job.content_id)
    if content is None or not content.html:
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


async def _step_score(job_id: UUID, state: dict) -> None:
    job = await _load_job(job_id)
    content = await _load_content(job.content_id)
    if content is None or not content.html:
        return

    async with SessionLocal() as session:
        sr = (
            await session.execute(
                select(SemanticReport).where(SemanticReport.job_id == job_id)
            )
        ).scalar_one_or_none()
        expected_terms = sr.required_terms if sr and sr.required_terms else []

    plain = BeautifulSoup(content.html, "lxml").get_text(" ", strip=True)
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


# ---------- helpers ----------

async def _load_job(job_id: UUID) -> Job:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise RuntimeError(f"job {job_id} not found")
        return job


async def _load_content(content_id: UUID | None) -> Content | None:
    if content_id is None:
        return None
    async with SessionLocal() as session:
        return await session.get(Content, content_id)


async def _load_domain_host(domain_id: UUID) -> str | None:
    async with SessionLocal() as session:
        d = await session.get(Domain, domain_id)
        return d.hostname if d else None


async def _load_report_terms(job_id: UUID) -> tuple[list[str], list[str], list[str]]:
    from sqlalchemy import select

    async with SessionLocal() as session:
        sr = (
            await session.execute(select(SemanticReport).where(SemanticReport.job_id == job_id))
        ).scalar_one_or_none()
        if sr is None:
            return [], [], []
        return (
            list(sr.required_terms or []),
            list(sr.entities or []),
            list(sr.content_gaps or []),
        )


async def _hydrate_state_from_db(job_id: UUID, state: dict) -> None:
    """When resuming a job, load enough state to skip re-running expensive steps."""
    from sqlalchemy import select

    async with SessionLocal() as session:
        sr = (
            await session.execute(select(SemanticReport).where(SemanticReport.job_id == job_id))
        ).scalar_one_or_none()
        if sr:
            state["report_id"] = sr.id


def _quick_image_prompt(blueprint: dict) -> str:
    angle = blueprint.get("angle") or ""
    title = blueprint.get("title_target") or ""
    return f"Photo éditoriale moderne et lumineuse illustrant {title}. Angle : {angle}".strip()


def _html_to_markdown(html: str) -> str:
    """Minimal HTML→Markdown for export. Not a full converter — preserves headings, lists, links."""
    soup = BeautifulSoup(html or "", "lxml")
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
