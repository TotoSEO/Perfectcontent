"""RQ queue setup + enqueuers. Worker entrypoints live in job_worker / index_worker."""
from __future__ import annotations

from uuid import UUID

import redis
from rq import Queue

from app.config import get_settings


def _conn() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url)


def default_queue() -> Queue:
    return Queue("default", connection=_conn(), default_timeout=600)


def index_queue() -> Queue:
    return Queue("index", connection=_conn(), default_timeout=3600)


def enqueue_run_job(job_id: UUID) -> None:
    default_queue().enqueue("app.workers.job_worker.run_job_sync", str(job_id), job_id=f"job:{job_id}")


def enqueue_resume_job(job_id: UUID, from_step: str) -> None:
    default_queue().enqueue(
        "app.workers.job_worker.run_job_sync",
        str(job_id),
        from_step,
        job_id=f"job:{job_id}:resume:{from_step}",
    )


def enqueue_index_domain(domain_id: UUID) -> None:
    index_queue().enqueue(
        "app.workers.index_worker.index_domain_sync",
        str(domain_id),
        job_id=f"index:{domain_id}",
    )


def enqueue_regenerate_image(content_id: UUID) -> None:
    default_queue().enqueue(
        "app.workers.job_worker.regenerate_image_sync",
        str(content_id),
        job_id=f"image:{content_id}",
    )
