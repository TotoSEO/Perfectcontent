"""Domain indexing pipeline: discover URLs → scrape → embed → persist."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.cache import get_redis
from app.db import SessionLocal
from app.models import Domain, IndexedPage
from app.services import scraper, sitemap
from app.services.embeddings import embed
from app.services.parser import parse_page

CONCURRENCY = 4


async def _publish_progress(domain_id: UUID, payload: dict) -> None:
    r = get_redis()
    data = json.dumps(payload)
    await r.set(f"pc:domain:{domain_id}:state", data, ex=3600)
    await r.publish(f"pc:domain:{domain_id}:progress", data)


async def _is_cancelled(domain_id: UUID) -> bool:
    r = get_redis()
    return bool(await r.get(f"pc:domain:{domain_id}:cancel"))


async def index_domain(domain_id: UUID) -> None:
    async with SessionLocal() as session:
        domain = await session.get(Domain, domain_id)
        if domain is None:
            return
        domain.status = "indexing"
        await session.commit()
        hostname = domain.hostname

    await _publish_progress(
        domain_id, {"status": "discovering", "pages_done": 0, "pages_total": 0, "cost": 0.0}
    )

    urls = await sitemap.discover_all_urls(hostname)
    total = len(urls)
    if total == 0:
        await _finalize(domain_id, status="error", error="no sitemap found")
        return

    await _publish_progress(
        domain_id,
        {"status": "scraping", "pages_done": 0, "pages_total": total, "cost": 0.0},
    )

    sem = asyncio.Semaphore(CONCURRENCY)
    pages_done = 0
    cost = 0.0

    async def handle(url: str) -> None:
        nonlocal pages_done, cost
        if await _is_cancelled(domain_id):
            return
        async with sem:
            try:
                batch = await scraper.scrape_urls([url], min_success=0)
            except Exception:  # noqa: BLE001
                pages_done += 1
                return
            cost += batch.cost
            for raw in batch.pages:
                parsed = parse_page(raw.url, raw.html, raw.markdown)
                emb_text = " ".join(
                    filter(None, [parsed.title, parsed.h1, " ".join(parsed.paragraphs[:1])])
                )[:2000]
                if not emb_text.strip():
                    pages_done += 1
                    continue
                try:
                    [vec] = await embed([emb_text])
                except Exception:  # noqa: BLE001
                    pages_done += 1
                    continue
                async with SessionLocal() as session:
                    stmt = pg_insert(IndexedPage).values(
                        domain_id=domain_id,
                        url=raw.url,
                        title=parsed.title,
                        h1=parsed.h1,
                        meta_description=None,
                        first_paragraph=parsed.paragraphs[0] if parsed.paragraphs else None,
                        full_content=raw.markdown[:50000] if raw.markdown else None,
                        embedding=vec,
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["domain_id", "url"],
                        set_={
                            "title": stmt.excluded.title,
                            "h1": stmt.excluded.h1,
                            "first_paragraph": stmt.excluded.first_paragraph,
                            "full_content": stmt.excluded.full_content,
                            "embedding": stmt.excluded.embedding,
                            "fetched_at": datetime.now(timezone.utc),
                        },
                    )
                    await session.execute(stmt)
                    await session.commit()
            pages_done += 1
            if pages_done % 5 == 0 or pages_done == total:
                await _publish_progress(
                    domain_id,
                    {
                        "status": "scraping",
                        "pages_done": pages_done,
                        "pages_total": total,
                        "cost": round(cost, 4),
                    },
                )

    await asyncio.gather(*(handle(u) for u in urls))

    if await _is_cancelled(domain_id):
        await _finalize(domain_id, status="cancelled", cost=cost, pages=pages_done)
        return

    await _finalize(domain_id, status="ready", cost=cost, pages=pages_done)


async def _finalize(
    domain_id: UUID,
    *,
    status: str,
    cost: float = 0.0,
    pages: int = 0,
    error: str | None = None,
) -> None:
    async with SessionLocal() as session:
        domain = await session.get(Domain, domain_id)
        if domain is None:
            return
        domain.status = status if status != "cancelled" else "ready"
        domain.last_indexed_at = datetime.now(timezone.utc)
        domain.index_cost_usd = round(cost, 4)
        # actual count from DB
        count = (
            await session.execute(
                select(IndexedPage.id).where(IndexedPage.domain_id == domain_id)
            )
        ).all()
        domain.pages_count = len(count)
        await session.commit()
    r = get_redis()
    await r.delete(f"pc:domain:{domain_id}:cancel")
    await _publish_progress(
        domain_id,
        {
            "status": status,
            "pages_done": pages,
            "pages_total": pages,
            "cost": round(cost, 4),
            "error": error,
        },
    )


async def reset_domain(domain_id: UUID) -> None:
    async with SessionLocal() as session:
        await session.execute(delete(IndexedPage).where(IndexedPage.domain_id == domain_id))
        await session.commit()
