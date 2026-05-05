"""Async DB engine + session factory.

Uses psycopg3 instead of asyncpg because asyncpg has known EBUSY issues
in restricted serverless runtimes (Vercel Python). psycopg3 supports
async natively via psycopg.AsyncConnection and works reliably.

Configured for Vercel serverless + Supabase Transaction pooler:
- NullPool : one connection per request, no shared pool
- prepare_threshold=None : pgBouncer in transaction mode rejects prepared
  statements; this disables psycopg's prepared statement cache
"""
from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings


def _normalize_url(url: str) -> tuple[str, dict]:
    """Normalize the DATABASE_URL for psycopg async usage.

    Accepts both `postgresql+asyncpg://` and `postgresql+psycopg://` scheme
    prefixes (the user might have either set in Vercel env vars). Forces
    `postgresql+psycopg://` since that's our driver now.

    Pulls the ?ssl= / ?sslmode= query param out of the URL into connect_args
    so psycopg gets a clean DSN.
    """
    if url.startswith("postgresql+asyncpg://"):
        url = "postgresql+psycopg://" + url[len("postgresql+asyncpg://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]

    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    sslmode: str | None = None
    if "ssl" in qs:
        v = qs.pop("ssl")[0].lower()
        if v in {"require", "true", "1", "verify-full"}:
            sslmode = "require"
    if "sslmode" in qs:
        sslmode = qs.pop("sslmode")[0]
    new_query = urlencode({k: v[0] for k, v in qs.items()})
    cleaned = urlunparse(parsed._replace(query=new_query))
    extra: dict = {}
    if sslmode:
        extra["sslmode"] = sslmode
    return cleaned, extra


settings = get_settings()
_clean_url, _ssl_extra = _normalize_url(settings.database_url)

engine = create_async_engine(
    _clean_url,
    poolclass=NullPool,
    connect_args={
        # pgBouncer transaction-mode: disable psycopg prepared statement cache
        "prepare_threshold": None,
        **_ssl_extra,
    },
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
