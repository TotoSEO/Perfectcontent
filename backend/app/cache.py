"""Single-tier cache backed by Postgres api_cache table.

In the Vercel serverless model there's no persistent Redis to share state
between invocations, so we collapse the previous two-tier cache to use
Supabase Postgres directly. Idempotency for expensive API calls (SERP,
scrape, embeddings) is preserved across cold starts because state is in DB.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select

from app.db import SessionLocal
from app.models.api_cache import ApiCache


def cache_key(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def get(key: str) -> Any | None:
    async with SessionLocal() as session:
        row = (
            await session.execute(select(ApiCache).where(ApiCache.cache_key == key))
        ).scalar_one_or_none()
        if row and row.expires_at > datetime.now(timezone.utc):
            return row.payload
    return None


async def set(  # noqa: A001 - intentional name
    key: str, payload: Any, ttl_seconds: int, cost_usd: float = 0.0
) -> None:
    expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with SessionLocal() as session:
        await session.execute(delete(ApiCache).where(ApiCache.cache_key == key))
        session.add(ApiCache(cache_key=key, payload=payload, cost_usd=cost_usd, expires_at=expires))
        await session.commit()


# --- compatibility shim so legacy code paths that referenced Redis don't break ---


class _NoopPubSub:
    async def subscribe(self, *_a, **_kw): pass
    async def unsubscribe(self, *_a, **_kw): pass
    async def get_message(self, *_a, **_kw): return None
    async def close(self): pass


class _NoopRedis:
    """Stand-in used by code paths that still try to call Redis after the
    refactor. Browsers now drive the pipeline by polling, so pubsub/SSE are
    no longer used. We keep these no-ops so any remaining import compiles."""

    async def get(self, *_a, **_kw): return None
    async def set(self, *_a, **_kw): return True
    async def delete(self, *_a, **_kw): return 0
    async def publish(self, *_a, **_kw): return 0

    def pubsub(self):  # noqa: ANN201
        return _NoopPubSub()


def get_redis() -> _NoopRedis:
    return _NoopRedis()
