"""RQ worker entrypoints. Sync wrappers around async pipeline functions."""
from __future__ import annotations

import asyncio
from uuid import UUID

from app.db import SessionLocal
from app.models import Content
from app.services import image as image_svc
from app.services.pipeline import resume_pipeline, run_pipeline


def run_job_sync(job_id: str, from_step: str | None = None) -> None:
    job_uuid = UUID(job_id)
    if from_step is None:
        asyncio.run(run_pipeline(job_uuid))
    else:
        asyncio.run(resume_pipeline(job_uuid, from_step=from_step))


def regenerate_image_sync(content_id: str) -> None:
    asyncio.run(_regenerate_image(UUID(content_id)))


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
