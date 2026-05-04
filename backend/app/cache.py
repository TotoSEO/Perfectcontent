"""Two-tier cache: Redis (fast) + Postgres api_cache table (durable)."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import delete, select

from app.config import get_settings
from app.db import SessionLocal
from app.models.api_cache import ApiCache

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


def cache_key(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def get(key: str) -> Any | None:
    r = get_redis()
    raw = await r.get(f"pc:cache:{key}")
    if raw is not None:
        return json.loads(raw)
    async with SessionLocal() as session:
        row = (
            await session.execute(select(ApiCache).where(ApiCache.cache_key == key))
        ).scalar_one_or_none()
        if row and row.expires_at > datetime.now(timezone.utc):
            await r.set(f"pc:cache:{key}", json.dumps(row.payload), ex=600)
            return row.payload
    return None


async def set(  # noqa: A001 - intentional name
    key: str, payload: Any, ttl_seconds: int, cost_usd: float = 0.0
) -> None:
    r = get_redis()
    await r.set(f"pc:cache:{key}", json.dumps(payload), ex=min(ttl_seconds, 3600))
    expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with SessionLocal() as session:
        await session.execute(delete(ApiCache).where(ApiCache.cache_key == key))
        session.add(ApiCache(cache_key=key, payload=payload, cost_usd=cost_usd, expires_at=expires))
        await session.commit()
