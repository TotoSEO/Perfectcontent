"""RQ worker entrypoints. Sync wrappers around async pipeline functions."""
from __future__ import annotations

import asyncio
from uuid import UUID

from app.audit import log_step
from app.db import SessionLocal
from app.models import Content, Job
from app.services import image as image_svc
from app.services import regenerate as regen_svc
from app.services.pipeline import resume_pipeline, run_pipeline


def run_job_sync(job_id: str, from_step: str | None = None) -> None:
    job_uuid = UUID(job_id)
    if from_step is None:
        asyncio.run(run_pipeline(job_uuid))
    else:
        asyncio.run(resume_pipeline(job_uuid, from_step=from_step))


def regenerate_image_sync(content_id: str) -> None:
    asyncio.run(_regenerate_image(UUID(content_id)))


def regenerate_section_sync(job_id: str, section_id: str) -> None:
    asyncio.run(_regenerate_section(UUID(job_id), section_id))


def regenerate_content_section_sync(content_id: str, section_id: str) -> None:
    asyncio.run(regen_svc.regenerate_section(UUID(content_id), section_id))


async def _regenerate_image(content_id: UUID) -> None:
    async with SessionLocal() as session:
        content = await session.get(Content, content_id)
        if content is None or not content.image_prompt:
            return
        prompt = content.image_prompt
    img = await image_svc.generate_image(prompt)
    async with SessionLocal() as session:
        content = await session.get(Content, content_id)
        if content is not None:
            content.image_url = img.url
            await session.commit()


async def _regenerate_section(job_id: UUID, section_id: str) -> None:
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None or job.content_id is None:
            return
        content_id = job.content_id

    await log_step(job_id, f"regen:{section_id}", "running")
    try:
        result = await regen_svc.regenerate_section(content_id, section_id)
    except Exception as exc:  # noqa: BLE001
        await log_step(job_id, f"regen:{section_id}", "failed", {"error": str(exc)})
        return

    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is not None:
            job.cost_actual = float(job.cost_actual or 0) + result.cost
            await session.commit()

    await log_step(job_id, f"regen:{section_id}", "done", {"cost": result.cost})
