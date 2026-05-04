from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Job
from app.schemas.job import JobOut

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("/{batch_id}", response_model=list[JobOut])
async def get_batch(batch_id: UUID, db: AsyncSession = Depends(get_db)) -> list[Job]:
    rows = (
        await db.execute(
            select(Job).where(Job.batch_id == batch_id).order_by(Job.created_at)
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "batch not found")
    return list(rows)
