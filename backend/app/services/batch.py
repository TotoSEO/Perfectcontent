"""Create N jobs from a single batch payload, all sharing a batch_id."""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Content, Job
from app.schemas.job import JobBatchCreateIn
from app.services import cost as cost_svc


async def create_batch(db: AsyncSession, payload: JobBatchCreateIn) -> tuple[uuid.UUID, list[Job]]:
    batch_id = uuid.uuid4()
    jobs: list[Job] = []

    for item in payload.items:
        link = item.internal_linking if item.internal_linking is not None else payload.internal_linking
        gen_img = item.generate_image if item.generate_image is not None else payload.generate_image
        rng = cost_svc.estimate(
            content_type=item.content_type, internal_linking=link
        )

        content = Content(
            folder_id=payload.folder_id,
            domain_id=payload.domain_id,
            keyword=item.keyword,
            content_type=item.content_type,
            status="analysis",
        )
        db.add(content)
        await db.flush()

        job = Job(
            content_id=content.id,
            keyword=item.keyword,
            content_type=item.content_type,
            location_code=payload.location_code,
            language_code=payload.language_code,
            domain_id=payload.domain_id,
            internal_linking=link,
            generate_image=gen_img,
            auto_validate_blueprint=payload.auto_validate_blueprint,
            batch_id=batch_id,
            cost_estimate_low=rng.low,
            cost_estimate_high=rng.high,
            cost_cap=payload.cost_cap,
            status="queued",
            audit={"steps": []},
        )
        db.add(job)
        jobs.append(job)

    await db.commit()
    for j in jobs:
        await db.refresh(j)
    return batch_id, jobs
