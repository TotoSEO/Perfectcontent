"""Endpoint for the in-app debug console."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import SystemLog

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("")
async def list_logs(
    level: str | None = Query(None, pattern="^(info|warn|error)$"),
    module: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(SystemLog).order_by(SystemLog.id.desc()).limit(limit)
    if level:
        stmt = stmt.where(SystemLog.level == level)
    if module:
        stmt = stmt.where(SystemLog.module == module)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "ts": r.ts.isoformat() if r.ts else None,
            "level": r.level,
            "module": r.module,
            "message": r.message,
            "meta": r.meta,
        }
        for r in rows
    ]


@router.delete("")
async def clear_logs(db: AsyncSession = Depends(get_db)) -> dict:
    """Clear all logs older than 1 hour, keep recent ones for context."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    await db.execute(delete(SystemLog).where(SystemLog.ts < cutoff))
    await db.commit()
    return {"ok": True}
