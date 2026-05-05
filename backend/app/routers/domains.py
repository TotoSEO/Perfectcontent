from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Domain
from app.schemas.domain import DomainIn, DomainOut
from app.services import indexer

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[DomainOut])
async def list_domains(db: AsyncSession = Depends(get_db)) -> list[Domain]:
    return list((await db.execute(select(Domain).order_by(Domain.hostname))).scalars().all())


@router.post("", response_model=DomainOut, status_code=status.HTTP_201_CREATED)
async def create_domain(payload: DomainIn, db: AsyncSession = Depends(get_db)) -> Domain:
    hostname = _normalize(payload.hostname)
    existing = (
        await db.execute(select(Domain).where(Domain.hostname == hostname))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "domain already exists")
    domain = Domain(hostname=hostname, status="pending")
    db.add(domain)
    await db.commit()
    await db.refresh(domain)
    return domain


@router.post("/{domain_id}/index-chunk")
async def index_chunk(
    domain_id: UUID,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Browser-driven chunked indexing: scrapes + embeds up to `limit` URLs
    per call (sized to fit Vercel's 60s function budget). Returns progress.
    The browser keeps calling until status="ready"."""
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "domain not found")
    return await indexer.index_chunk(domain_id, limit=limit)


@router.post("/{domain_id}/reindex", response_model=DomainOut)
async def reindex(domain_id: UUID, db: AsyncSession = Depends(get_db)) -> Domain:
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "domain not found")
    await indexer.reset_domain(domain_id)
    domain.status = "pending"
    await db.commit()
    await db.refresh(domain)
    return domain


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "domain not found")
    await db.delete(domain)
    await db.commit()


def _normalize(hostname: str) -> str:
    h = hostname.strip().lower()
    for prefix in ("https://", "http://"):
        if h.startswith(prefix):
            h = h[len(prefix):]
    h = h.rstrip("/")
    if h.startswith("www."):
        h = h[4:]
    if not h:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid hostname")
    if "/" in h or " " in h:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid hostname")
    return h
