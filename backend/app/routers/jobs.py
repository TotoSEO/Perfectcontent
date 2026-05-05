from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Content, Job
from app.schemas.job import (
    BatchOut,
    BlueprintEditIn,
    CannibalizationIn,
    JobBatchCreateIn,
    JobBatchEstimateOut,
    JobCreateIn,
    JobEstimateIn,
    JobEstimateOut,
    JobOut,
    RegenerateSectionIn,
    RewriteJobIn,
)
from app.services import fusion as fusion_sanitize  # for sanitize_html re-use
from app.services import batch as batch_svc
from app.services import cannibalization, cost
from app.services import pipeline as pipeline_svc
from app.services import regenerate as regen_svc

router = APIRouter(dependencies=[Depends(require_session)])


@router.post("/estimate", response_model=JobEstimateOut)
async def estimate(payload: JobEstimateIn) -> JobEstimateOut:
    rng = cost.estimate(
        content_type=payload.content_type, internal_linking=payload.internal_linking
    )
    return JobEstimateOut(low=rng.low, high=rng.high)


@router.post("/cannibalization-check")
async def check_cannibalization(
    payload: CannibalizationIn, db: AsyncSession = Depends(get_db)
) -> dict:
    conflicts = await cannibalization.check_cannibalization(
        db, keyword=payload.keyword, domain_id=payload.domain_id
    )
    return {"conflicts": [c.model_dump() for c in conflicts]}


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobCreateIn, db: AsyncSession = Depends(get_db)) -> Job:
    rng = cost.estimate(
        content_type=payload.content_type, internal_linking=payload.internal_linking
    )
    content = Content(
        folder_id=payload.folder_id,
        domain_id=payload.domain_id,
        keyword=payload.keyword,
        content_type=payload.content_type,
        status="analysis",
    )
    db.add(content)
    await db.flush()

    job = Job(
        content_id=content.id,
        keyword=payload.keyword,
        content_type=payload.content_type,
        location_code=payload.location_code,
        language_code=payload.language_code,
        domain_id=payload.domain_id,
        internal_linking=payload.internal_linking,
        auto_validate_blueprint=payload.auto_validate_blueprint,
        cost_estimate_low=rng.low,
        cost_estimate_high=rng.high,
        cost_cap=payload.cost_cap,
        status="queued",
        audit={"steps": []},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/batch/estimate", response_model=JobBatchEstimateOut)
async def batch_estimate(payload: JobBatchCreateIn) -> JobBatchEstimateOut:
    low = high = 0.0
    for item in payload.items:
        rng = cost.estimate(
            content_type=item.content_type, internal_linking=payload.internal_linking
        )
        low += rng.low
        high += rng.high
    return JobBatchEstimateOut(
        items=len(payload.items),
        low_total=round(low, 4),
        high_total=round(high, 4),
    )


@router.post("/rewrite/estimate")
async def estimate_rewrite(payload: RewriteJobIn) -> dict:
    """Cost estimate for the rewrite pipeline (SERP + scrape + analyse + rewrite)."""
    sanitized = fusion_sanitize.sanitize_html(payload.source_content)
    rng = cost.estimate_rewrite(
        source_chars=len(sanitized), internal_linking=payload.internal_linking
    )
    return {
        "low": rng.low,
        "high": rng.high,
        "source_chars": len(sanitized),
    }


@router.post("/rewrite", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_rewrite_job(
    payload: RewriteJobIn, db: AsyncSession = Depends(get_db)
) -> Job:
    """Create a rewrite job: SERP analysis + rewrite of an existing piece.

    The frontend then drives this job through /api/jobs/{id}/step/{name} like
    a normal job. Pipeline detects mode='rewrite' and branches accordingly:
    - blueprint step produces only target_words (no full plan)
    - generate step calls rewrite.rewrite_with_context() with source_content
    """
    rng = cost.estimate(
        content_type=payload.content_type, internal_linking=payload.internal_linking
    )
    sanitized_source = fusion_sanitize.sanitize_html(payload.source_content)

    content = Content(
        folder_id=payload.folder_id,
        domain_id=payload.domain_id,
        keyword=payload.keyword,
        content_type=payload.content_type,
        status="analysis",
    )
    db.add(content)
    await db.flush()

    job = Job(
        content_id=content.id,
        keyword=payload.keyword,
        content_type=payload.content_type,
        location_code=payload.location_code,
        language_code=payload.language_code,
        domain_id=payload.domain_id,
        internal_linking=payload.internal_linking,
        auto_validate_blueprint=True,
        mode="rewrite",
        source_content=sanitized_source,
        cost_estimate_low=rng.low,
        cost_estimate_high=rng.high,
        cost_cap=payload.cost_cap,
        status="queued",
        audit={"steps": []},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/batch", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: JobBatchCreateIn, db: AsyncSession = Depends(get_db)
) -> BatchOut:
    batch_id, jobs = await batch_svc.create_batch(db, payload)
    return BatchOut(
        batch_id=batch_id,
        jobs=[JobOut.model_validate(j) for j in jobs],
    )


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


@router.post("/{job_id}/step/{step}")
async def run_step(job_id: UUID, step: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Run a single pipeline step. The browser orchestrates by calling this
    sequentially for each step in the canonical order, polling /api/jobs/{id}
    between calls if it wants extra detail."""
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return await pipeline_svc.run_step(job_id, step)


@router.post("/{job_id}/blueprint", response_model=JobOut)
async def edit_blueprint(
    job_id: UUID, payload: BlueprintEditIn, db: AsyncSession = Depends(get_db)
) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    if job.content_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no content attached")
    content = await db.get(Content, job.content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    content.blueprint = payload.blueprint
    job.status = "running"
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/regenerate-section", response_model=JobOut)
async def regenerate_section(
    job_id: UUID,
    payload: RegenerateSectionIn,
    db: AsyncSession = Depends(get_db),
) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    if job.content_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no content attached")
    await regen_svc.regenerate_section(job.content_id, payload.section_id)
    return job


@router.post("/{job_id}/retry", response_model=JobOut)
async def retry_job(job_id: UUID, db: AsyncSession = Depends(get_db)) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    if job.status not in {"failed", "capped"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "only failed or capped jobs can be retried")
    await pipeline_svc.reset_for_retry(job_id)
    await db.refresh(job)
    return job


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(job_id: UUID, db: AsyncSession = Depends(get_db)) -> Job:
    """Mark a job as failed by user choice. The browser-driven model means we
    just stop calling next steps; setting status here gives a clean record."""
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    job.status = "failed"
    job.error = "cancelled by user"
    await db.commit()
    await db.refresh(job)
    return job
