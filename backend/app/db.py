"""Async DB engine + session factory.

Configured for serverless: NullPool (no shared connection pool across
invocations), prepared-statement cache disabled (Supabase pgBouncer
in Transaction-mode rejects them), short connect timeout.
"""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,  # one connection per request, no pool
    connect_args={
        # asyncpg-specific: disable prepared statement cache for pgBouncer
        # compatibility (Supabase Transaction pooler rejects them).
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "timeout": 10,
    },
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
