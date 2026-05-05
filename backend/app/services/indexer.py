"""Browser-driven chunked domain indexer.

The first chunk discovers sitemaps and stores the URL list as `pending` rows
in indexed_pages (without embeddings). Subsequent chunks pick up `limit`
unprocessed rows, scrape + embed them, and persist. The browser keeps polling
this endpoint until the domain status flips to `ready`.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import SessionLocal
from app.models import Domain, IndexedPage
from app.services import scraper, sitemap
from app.services.embeddings import embed
from app.services.parser import parse_page

CONCURRENCY = 4


async def index_chunk(domain_id: UUID, *, limit: int = 30) -> dict:
    async with SessionLocal() as session:
        domain = await session.get(Domain, domain_id)
        if domain is None:
            raise RuntimeError("domain not found")
        hostname = domain.hostname
        status = domain.status

    # Phase 1: first call → discover URLs and seed empty rows
    if status in {"pending", "error"}:
        await _seed_urls(domain_id, hostname)
        await _set_status(domain_id, "indexing")

    # Phase 2: pick `limit` unprocessed URLs and process them
    todo = await _pick_unprocessed(domain_id, limit=limit)
    if not todo:
        await _set_status(domain_id, "ready", finalize=True)
        return await _progress(domain_id)

    sem = asyncio.Semaphore(CONCURRENCY)

    async def handle(row_id: UUID, url: str) -> float:
        async with sem:
            try:
                batch = await scraper.scrape_urls([url], min_success=0)
            except Exception:  # noqa: BLE001
                await _mark_failed(row_id)
                return 0.0
            cost = batch.cost
            for raw in batch.pages:
                parsed = parse_page(raw.url, raw.html, raw.markdown)
                emb_text = " ".join(
                    filter(None, [parsed.title, parsed.h1, " ".join(parsed.paragraphs[:1])])
                )[:2000]
                if not emb_text.strip():
                    await _mark_failed(row_id)
                    continue
                try:
                    vecs = await embed([emb_text])
                except Exception:  # noqa: BLE001
                    await _mark_failed(row_id)
                    continue
                if not vecs:
                    await _mark_failed(row_id)
                    continue
                await _persist_indexed(
                    row_id=row_id,
                    parsed_title=parsed.title,
                    parsed_h1=parsed.h1,
                    parsed_first_paragraph=parsed.paragraphs[0] if parsed.paragraphs else None,
                    full_content=raw.markdown[:50000] if raw.markdown else None,
                    embedding=vecs[0],
                )
            return cost

    results = await asyncio.gather(*(handle(row_id, url) for row_id, url in todo))
    chunk_cost = sum(results)
    await _add_cost(domain_id, chunk_cost)

    # Re-check: more remaining?
    remaining = await _count_unprocessed(domain_id)
    if remaining == 0:
        await _set_status(domain_id, "ready", finalize=True)

    return await _progress(domain_id)


async def reset_domain(domain_id: UUID) -> None:
    """Wipe the URL list so a fresh re-index starts from scratch on the next call."""
    async with SessionLocal() as session:
        await session.execute(
            IndexedPage.__table__.delete().where(IndexedPage.domain_id == domain_id)
        )
        await session.commit()


# ---------- helpers ----------


async def _seed_urls(domain_id: UUID, hostname: str) -> None:
    urls = await sitemap.discover_all_urls(hostname)
    if not urls:
        await _set_status(domain_id, "error", error="no sitemap found")
        return

    async with SessionLocal() as session:
        for url in urls:
            stmt = pg_insert(IndexedPage).values(
                domain_id=domain_id,
                url=url,
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["domain_id", "url"])
            await session.execute(stmt)
        await session.commit()


async def _pick_unprocessed(domain_id: UUID, *, limit: int) -> list[tuple[UUID, str]]:
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(IndexedPage.id, IndexedPage.url)
                .where(IndexedPage.domain_id == domain_id)
                .where(IndexedPage.embedding.is_(None))
                .where(IndexedPage.title.is_(None))  # not yet attempted
                .limit(limit)
            )
        ).all()
        return [(r[0], r[1]) for r in rows]


async def _persist_indexed(
    *,
    row_id: UUID,
    parsed_title: str | None,
    parsed_h1: str | None,
    parsed_first_paragraph: str | None,
    full_content: str | None,
    embedding: list[float],
) -> None:
    async with SessionLocal() as session:
        row = await session.get(IndexedPage, row_id)
        if row is None:
            return
        row.title = parsed_title or "(no title)"
        row.h1 = parsed_h1
        row.first_paragraph = parsed_first_paragraph
        row.full_content = full_content
        row.embedding = embedding
        row.fetched_at = datetime.now(timezone.utc)
        await session.commit()


async def _mark_failed(row_id: UUID) -> None:
    """Mark a row as attempted-but-failed (title set but no embedding)."""
    async with SessionLocal() as session:
        row = await session.get(IndexedPage, row_id)
        if row is None:
            return
        row.title = "(scrape failed)"
        await session.commit()


async def _count_unprocessed(domain_id: UUID) -> int:
    async with SessionLocal() as session:
        n = (
            await session.execute(
                select(func.count())
                .select_from(IndexedPage)
                .where(IndexedPage.domain_id == domain_id)
                .where(IndexedPage.embedding.is_(None))
                .where(IndexedPage.title.is_(None))
            )
        ).scalar()
        return int(n or 0)


async def _set_status(
    domain_id: UUID, status: str, *, finalize: bool = False, error: str | None = None
) -> None:
    async with SessionLocal() as session:
        d = await session.get(Domain, domain_id)
        if d is None:
            return
        d.status = status
        if finalize:
            d.last_indexed_at = datetime.now(timezone.utc)
            count = (
                await session.execute(
                    select(func.count())
                    .select_from(IndexedPage)
                    .where(IndexedPage.domain_id == domain_id)
                    .where(IndexedPage.embedding.is_not(None))
                )
            ).scalar()
            d.pages_count = int(count or 0)
        await session.commit()


async def _add_cost(domain_id: UUID, amount: float) -> None:
    if amount <= 0:
        return
    async with SessionLocal() as session:
        d = await session.get(Domain, domain_id)
        if d is None:
            return
        d.index_cost_usd = float(d.index_cost_usd or 0) + amount
        await session.commit()


async def _progress(domain_id: UUID) -> dict:
    async with SessionLocal() as session:
        d = await session.get(Domain, domain_id)
        if d is None:
            return {"status": "missing"}
        total = (
            await session.execute(
                select(func.count())
                .select_from(IndexedPage)
                .where(IndexedPage.domain_id == domain_id)
            )
        ).scalar()
        done = (
            await session.execute(
                select(func.count())
                .select_from(IndexedPage)
                .where(IndexedPage.domain_id == domain_id)
                .where(IndexedPage.embedding.is_not(None))
            )
        ).scalar()
        return {
            "status": d.status,
            "pages_total": int(total or 0),
            "pages_done": int(done or 0),
            "cost": float(d.index_cost_usd or 0),
        }
