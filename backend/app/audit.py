"""Per-job audit trail: appends step events to jobs.audit JSONB."""
from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from sqlalchemy import update

from app.db import SessionLocal
from app.models.job import Job


async def log_step(job_id: UUID, step: str, status: str, payload: dict[str, Any] | None = None) -> None:
    entry = {"step": step, "status": status, "ts": time.time(), "payload": payload or {}}
    async with SessionLocal() as session:
        job = (await session.execute(_select_job(job_id))).scalar_one_or_none()
        if job is None:
            return
        audit = dict(job.audit or {})
        steps = list(audit.get("steps", []))
        steps.append(entry)
        audit["steps"] = steps
        await session.execute(update(Job).where(Job.id == job_id).values(audit=audit))
        await session.commit()


def _select_job(job_id: UUID):
    from sqlalchemy import select

    return select(Job).where(Job.id == job_id)
