"""Pre-flight cannibalization detection.

Embed the new keyword and kNN-search both indexed_pages and contents for the domain.
Anything above `threshold` is reported as a potential conflict.
"""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Content, IndexedPage
from app.services.embeddings import embed


class Conflict(BaseModel):
    source: str  # "indexed" | "draft"
    url: str | None
    title: str | None
    similarity: float
    content_id: UUID | None = None


async def check_cannibalization(
    db: AsyncSession,
    *,
    keyword: str,
    domain_id: UUID,
    threshold: float = 0.85,
    limit: int = 5,
) -> list[Conflict]:
    [vec] = await embed([keyword])

    indexed_stmt = (
        select(
            IndexedPage.url,
            IndexedPage.title,
            (1 - IndexedPage.embedding.cosine_distance(vec)).label("sim"),
        )
        .where(IndexedPage.domain_id == domain_id)
        .where(IndexedPage.embedding.is_not(None))
        .order_by(IndexedPage.embedding.cosine_distance(vec))
        .limit(limit)
    )
    contents_stmt = (
        select(
            Content.id,
            Content.keyword,
            (1 - Content.embedding.cosine_distance(vec)).label("sim"),
        )
        .where(Content.domain_id == domain_id)
        .where(Content.embedding.is_not(None))
        .order_by(Content.embedding.cosine_distance(vec))
        .limit(limit)
    )

    conflicts: list[Conflict] = []
    for url, title, sim in (await db.execute(indexed_stmt)).all():
        if float(sim) >= threshold:
            conflicts.append(Conflict(source="indexed", url=url, title=title, similarity=float(sim)))
    for cid, kw, sim in (await db.execute(contents_stmt)).all():
        if float(sim) >= threshold:
            conflicts.append(
                Conflict(source="draft", url=None, title=kw, similarity=float(sim), content_id=cid)
            )
    return conflicts
