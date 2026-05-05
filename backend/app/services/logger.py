"""Lightweight in-app logger writing to system_logs table.

Designed for solo single-user debug. Capped at MAX_ROWS to keep the table
small (auto-trim on insert). Only top-level events get logged: job
transitions, errors, important step actions. Per-step audit lives in
jobs.audit JSONB and is NOT duplicated here.
"""
from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import delete, select

from app.db import SessionLocal
from app.models.system_log import SystemLog

Level = Literal["info", "warn", "error"]
MAX_ROWS = 500


async def log(
    level: Level,
    message: str,
    *,
    module: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    try:
        async with SessionLocal() as session:
            session.add(SystemLog(level=level, module=module, message=message, meta=meta))
            await session.commit()
            # Trim oldest rows above the cap. Cheap because id is a sequence.
            count = (await session.execute(select(SystemLog.id).order_by(SystemLog.id.desc()).limit(1))).scalar()
            if count and count > MAX_ROWS:
                cutoff = count - MAX_ROWS
                await session.execute(delete(SystemLog).where(SystemLog.id <= cutoff))
                await session.commit()
    except Exception:
        # Don't let logging break the app
        pass


async def info(message: str, *, module: str | None = None, **meta: Any) -> None:
    await log("info", message, module=module, meta=meta or None)


async def warn(message: str, *, module: str | None = None, **meta: Any) -> None:
    await log("warn", message, module=module, meta=meta or None)


async def error(message: str, *, module: str | None = None, **meta: Any) -> None:
    await log("error", message, module=module, meta=meta or None)
