import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.cache import get_redis
from app.db import get_db
from app.models import Domain
from app.schemas.domain import DomainIn, DomainOut
from app.workers.queue import enqueue_index_domain

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
    enqueue_index_domain(domain.id)
    return domain


@router.post("/{domain_id}/reindex", response_model=DomainOut)
async def reindex(domain_id: UUID, db: AsyncSession = Depends(get_db)) -> Domain:
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "domain not found")
    domain.status = "pending"
    await db.commit()
    await db.refresh(domain)
    enqueue_index_domain(domain.id)
    return domain


@router.post("/{domain_id}/cancel")
async def cancel_indexing(domain_id: UUID) -> dict[str, bool]:
    r = get_redis()
    await r.set(f"pc:domain:{domain_id}:cancel", "1", ex=3600)
    return {"ok": True}


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    domain = await db.get(Domain, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "domain not found")
    await db.delete(domain)
    await db.commit()


@router.get("/{domain_id}/progress")
async def progress_stream(domain_id: UUID) -> StreamingResponse:
    async def gen():
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(f"pc:domain:{domain_id}:progress")
        try:
            # Send current snapshot first
            snap = await r.get(f"pc:domain:{domain_id}:state")
            if snap:
                yield f"data: {snap}\n\n"
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if msg is None:
                    yield ": keepalive\n\n"
                    continue
                yield f"data: {msg['data']}\n\n"
                payload = json.loads(msg["data"])
                if payload.get("status") in {"ready", "error", "cancelled"}:
                    break
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()

    return StreamingResponse(gen(), media_type="text/event-stream")


def _normalize(hostname: str) -> str:
    h = hostname.strip().lower()
    for prefix in ("https://", "http://"):
        if h.startswith(prefix):
            h = h[len(prefix) :]
    h = h.rstrip("/")
    if h.startswith("www."):
        h = h[4:]
    if not h:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid hostname")
    # Reject anything that doesn't look like a hostname
    if "/" in h or " " in h:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid hostname")
    return h
