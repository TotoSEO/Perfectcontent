import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.cache import get_redis
from app.db import get_db
from app.models import Content, Job
from app.schemas.job import (
    BlueprintEditIn,
    CannibalizationIn,
    JobCreateIn,
    JobEstimateIn,
    JobEstimateOut,
    JobOut,
)
from app.services import cannibalization, cost
from app.workers.queue import enqueue_run_job, enqueue_resume_job

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
        cost_estimate_low=rng.low,
        cost_estimate_high=rng.high,
        cost_cap=payload.cost_cap,
        status="queued",
        audit={"steps": []},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    enqueue_run_job(job.id)
    return job


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


@router.get("/{job_id}/events")
async def job_events(job_id: UUID) -> StreamingResponse:
    async def gen():
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(f"pc:job:{job_id}:events")
        try:
            snap = await r.get(f"pc:job:{job_id}:state")
            if snap:
                yield f"data: {snap}\n\n"
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if msg is None:
                    yield ": keepalive\n\n"
                    continue
                yield f"data: {msg['data']}\n\n"
                payload = json.loads(msg["data"])
                if payload.get("status") in {"done", "failed", "capped", "paused"}:
                    if payload.get("status") != "paused":
                        break
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()

    return StreamingResponse(gen(), media_type="text/event-stream")


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
    job.status = "queued"
    await db.commit()
    await db.refresh(job)
    enqueue_resume_job(job.id, from_step="generate")
    return job


@router.post("/{job_id}/regenerate-section", response_model=JobOut)
async def regenerate_section(
    job_id: UUID, db: AsyncSession = Depends(get_db)
) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    enqueue_resume_job(job.id, from_step="generate")
    return job


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(job_id: UUID, db: AsyncSession = Depends(get_db)) -> Job:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    r = get_redis()
    await r.set(f"pc:job:{job_id}:cancel", "1", ex=3600)
    job.status = "failed"
    job.error = "cancelled by user"
    await db.commit()
    await db.refresh(job)
    return job
