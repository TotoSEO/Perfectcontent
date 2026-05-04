from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Content
from app.schemas.content import ContentOut, ContentPatch, RegenerateContentSectionIn
from app.workers.queue import enqueue_regenerate_content_section, enqueue_regenerate_image

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[ContentOut])
async def list_contents(
    folder_id: UUID | None = None, db: AsyncSession = Depends(get_db)
) -> list[Content]:
    stmt = select(Content).order_by(Content.updated_at.desc())
    if folder_id is not None:
        stmt = stmt.where(Content.folder_id == folder_id)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{content_id}", response_model=ContentOut)
async def get_content(content_id: UUID, db: AsyncSession = Depends(get_db)) -> Content:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    return content


@router.patch("/{content_id}", response_model=ContentOut)
async def patch_content(
    content_id: UUID, payload: ContentPatch, db: AsyncSession = Depends(get_db)
) -> Content:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(content, field, value)
    await db.commit()
    await db.refresh(content)
    return content


@router.post("/{content_id}/regenerate-image")
async def regenerate_image(content_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    enqueue_regenerate_image(content.id)
    return {"ok": True}


@router.post("/{content_id}/regenerate-section")
async def regenerate_content_section(
    content_id: UUID,
    payload: RegenerateContentSectionIn,
    db: AsyncSession = Depends(get_db),
) -> dict:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    enqueue_regenerate_content_section(content.id, payload.section_id)
    return {"ok": True}


@router.get("/{content_id}/export", response_class=PlainTextResponse)
async def export_content(
    content_id: UUID,
    format: str = Query("html", pattern="^(html|md)$"),
    db: AsyncSession = Depends(get_db),
) -> str:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    if format == "md":
        return content.markdown or ""
    return content.html or ""


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(content_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    await db.delete(content)
    await db.commit()
