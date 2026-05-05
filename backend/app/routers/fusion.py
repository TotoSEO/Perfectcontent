"""Content fusion endpoint — merges N existing contents into a unified piece."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Content
from app.services import fusion as fusion_svc

router = APIRouter(dependencies=[Depends(require_session)])


class FusionIn(BaseModel):
    keyword: str
    sources: list[str] = Field(..., min_length=2)
    folder_id: UUID | None = None


class FusionOut(BaseModel):
    content_id: UUID
    cost: float


@router.post("", response_model=FusionOut, status_code=status.HTTP_201_CREATED)
async def fuse(payload: FusionIn, db: AsyncSession = Depends(get_db)) -> FusionOut:
    if len(payload.sources) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "at least 2 sources required")

    result = await fusion_svc.fuse_contents(
        keyword=payload.keyword, sources=payload.sources
    )

    content = Content(
        folder_id=payload.folder_id,
        keyword=payload.keyword,
        content_type="blog",
        status="generated",
        chosen_title=result.title,
        chosen_meta=result.meta,
        title_variants=[{"title": result.title, "meta": result.meta}],
        html=result.html,
    )
    db.add(content)
    await db.commit()
    await db.refresh(content)
    return FusionOut(content_id=content.id, cost=result.cost)
