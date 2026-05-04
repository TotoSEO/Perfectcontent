"""RQ worker entrypoint for domain indexing."""
from __future__ import annotations

import asyncio
from uuid import UUID

from app.services.indexer import index_domain


def index_domain_sync(domain_id: str) -> None:
    asyncio.run(index_domain(UUID(domain_id)))
