"""CRUD + runner for Query Fan-Out reports (DataForSEO LLM Responses)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import SessionLocal, get_db
from app.models import FanoutReport
from app.schemas.fanout import FanoutCreate, FanoutListItem, FanoutOut
from app.services import llm_fanout
from app.services import logger as syslog

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[FanoutListItem])
async def list_reports(db: AsyncSession = Depends(get_db)) -> list[FanoutReport]:
    rows = (
        await db.execute(select(FanoutReport).order_by(FanoutReport.created_at.desc()))
    ).scalars().all()
    return list(rows)


@router.post("", response_model=FanoutOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: FanoutCreate, db: AsyncSession = Depends(get_db),
) -> FanoutReport:
    requested = [m for m in payload.models if m in llm_fanout.SUPPORTED_MODELS]
    if not requested:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"models must include at least one of {list(llm_fanout.SUPPORTED_MODELS)}",
        )
    row = FanoutReport(
        keyword=payload.keyword.strip(),
        country_iso=(payload.country_iso or None),
        models=",".join(requested),
        status="queued",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/{report_id}/run", response_model=FanoutOut)
async def run_report(report_id: UUID, db: AsyncSession = Depends(get_db)) -> FanoutReport:
    row = await db.get(FanoutReport, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "fan-out report not found")
    await _run(report_id)
    await db.refresh(row)
    return row


@router.get("/{report_id}", response_model=FanoutOut)
async def get_report(report_id: UUID, db: AsyncSession = Depends(get_db)) -> FanoutReport:
    row = await db.get(FanoutReport, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "fan-out report not found")
    return row


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(report_id: UUID, db: AsyncSession = Depends(get_db)):
    # No `-> None` annotation: combined with `from __future__ import annotations`
    # at module top, FastAPI would resolve the annotation to NoneType (truthy)
    # and trip its `204 must not have a response body` assertion. Leaving the
    # return type implicit keeps response_model falsy and the route registers
    # cleanly across FastAPI 0.100+.
    row = await db.get(FanoutReport, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "fan-out report not found")
    await db.delete(row)
    await db.commit()


async def _run(report_id: UUID) -> None:
    """Background-style runner. Mirrors semantic_analysis_svc.run shape:
    row-level lock + status guard, 5-min stale recovery."""
    async with SessionLocal() as session:
        row = await session.get(FanoutReport, report_id, with_for_update=True)
        if row is None:
            return
        if row.status == "running":
            try:
                age = datetime.now(timezone.utc) - row.updated_at
                if age < timedelta(minutes=5):
                    return
            except Exception:
                return
        row.status = "running"
        row.error = None
        await session.commit()
        keyword = row.keyword
        country = row.country_iso
        models = [m for m in row.models.split(",") if m]

    try:
        result = await llm_fanout.run_fanout(keyword, models, country_iso=country)
        dumped = llm_fanout.to_dict(result)

        async with SessionLocal() as session:
            row = await session.get(FanoutReport, report_id)
            if row is None:
                return
            row.responses = dumped["responses"]
            row.unique_queries = dumped["unique_queries"]
            row.citations = dumped["citations"]
            row.cost = round(result.total_cost, 4)
            row.status = "done"
            row.error = None
            await session.commit()

    except Exception as exc:  # noqa: BLE001
        await syslog.error(
            f"fanout run failed: {exc}",
            module="fanout",
            report_id=str(report_id),
            error=str(exc),
        )
        async with SessionLocal() as session:
            row = await session.get(FanoutReport, report_id)
            if row is not None:
                row.status = "failed"
                row.error = str(exc)
                await session.commit()
