from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Audit
from app.schemas.audit import AuditCreateIn, AuditListItem, AuditOut

router = APIRouter(dependencies=[Depends(require_session)])


@router.post("", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
async def create_audit(payload: AuditCreateIn, db: AsyncSession = Depends(get_db)) -> Audit:
    audit = Audit(
        name=payload.name,
        folder_id=payload.folder_id,
        source_filename=payload.source_filename,
        crawl_date=payload.crawl_date,
        url_count=payload.url_count,
        score=payload.score,
        summary=payload.summary,
        issues=payload.issues,
        notes=payload.notes,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(audit)
    return audit


@router.get("", response_model=list[AuditListItem])
async def list_audits(db: AsyncSession = Depends(get_db)) -> list[Audit]:
    rows = (
        await db.execute(select(Audit).order_by(Audit.created_at.desc()))
    ).scalars().all()
    return list(rows)


@router.get("/{audit_id}", response_model=AuditOut)
async def get_audit(audit_id: UUID, db: AsyncSession = Depends(get_db)) -> Audit:
    audit = await db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit not found")
    return audit


@router.delete("/{audit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audit(audit_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    audit = await db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "audit not found")
    await db.delete(audit)
    await db.commit()
