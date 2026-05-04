from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DomainIn(BaseModel):
    hostname: str


class DomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    hostname: str
    status: str
    last_indexed_at: datetime | None
    pages_count: int
    index_cost_usd: float
    created_at: datetime
