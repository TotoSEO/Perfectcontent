"""CRUD + pipeline runner for standalone semantic analyses."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import SemanticAnalysis
from app.schemas.semantic_analysis import (
    SemanticAnalysisCreate,
    SemanticAnalysisListItem,
    SemanticAnalysisOut,
    SemanticAnalysisPatch,
)
from app.services import semantic_analysis_svc

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[SemanticAnalysisListItem])
async def list_analyses(db: AsyncSession = Depends(get_db)) -> list[SemanticAnalysis]:
    rows = (
        await db.execute(
            select(SemanticAnalysis).order_by(SemanticAnalysis.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post("", response_model=SemanticAnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    payload: SemanticAnalysisCreate, db: AsyncSession = Depends(get_db),
) -> SemanticAnalysis:
    row = SemanticAnalysis(
        keyword=payload.keyword.strip(),
        location_code=payload.location_code,
        language_code=payload.language_code,
        status="queued",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/{analysis_id}/run", response_model=SemanticAnalysisOut)
async def run_analysis(
    analysis_id: UUID, db: AsyncSession = Depends(get_db),
) -> SemanticAnalysis:
    """Run the full SERP → BM25 pipeline. Synchronous (~30-90s)."""
    row = await db.get(SemanticAnalysis, analysis_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "analysis not found")
    await semantic_analysis_svc.run(analysis_id)
    await db.refresh(row)
    return row


@router.get("/{analysis_id}", response_model=SemanticAnalysisOut)
async def get_analysis(
    analysis_id: UUID, db: AsyncSession = Depends(get_db),
) -> SemanticAnalysis:
    row = await db.get(SemanticAnalysis, analysis_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "analysis not found")
    return row


@router.patch("/{analysis_id}", response_model=SemanticAnalysisOut)
async def patch_analysis(
    analysis_id: UUID,
    payload: SemanticAnalysisPatch,
    db: AsyncSession = Depends(get_db),
) -> SemanticAnalysis:
    row = await db.get(SemanticAnalysis, analysis_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "analysis not found")
    if payload.draft_html is not None:
        row.draft_html = payload.draft_html
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    analysis_id: UUID, db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(SemanticAnalysis, analysis_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "analysis not found")
    await db.delete(row)
    await db.commit()
