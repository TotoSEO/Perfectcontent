"""Async DB engine + session factory.

Configured for Vercel serverless + Supabase Transaction pooler (port 6543):
- NullPool : one connection per request, no shared pool across invocations
- statement_cache_size=0 : pgBouncer in transaction mode rejects prepared statements
- ssl='require' : the pooler enforces TLS without strict cert verification
- short connect timeout : fail fast in serverless rather than holding the
  function open
"""
from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings


def _normalize_url(url: str) -> tuple[str, dict]:
    """Strip any ?ssl= query param so we can pass it via connect_args instead.

    asyncpg accepts SSL config via connect_args (`ssl='require'`), not the URL,
    when used through SQLAlchemy. We pop it from the URL if present and turn
    it into a connect_args entry."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    ssl_pref: str | None = None
    if "ssl" in qs:
        ssl_pref = qs.pop("ssl")[0]
    if "sslmode" in qs:
        ssl_pref = ssl_pref or qs.pop("sslmode")[0]
    new_query = urlencode({k: v[0] for k, v in qs.items()})
    cleaned = urlunparse(parsed._replace(query=new_query))
    extra: dict = {}
    if ssl_pref and ssl_pref.lower() in {"require", "true", "1", "verify-full", "prefer"}:
        extra["ssl"] = "require"
    return cleaned, extra


settings = get_settings()
_clean_url, _ssl_extra = _normalize_url(settings.database_url)

engine = create_async_engine(
    _clean_url,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "timeout": 10,
        **_ssl_extra,
    },
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
