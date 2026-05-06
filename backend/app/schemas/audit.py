from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditCreateIn(BaseModel):
    name: str
    folder_id: uuid.UUID | None = None
    source_filename: str | None = None
    crawl_date: datetime | None = None
    url_count: int = 0
    score: float | None = None
    summary: dict | None = None  # category scores + counts
    issues: dict | None = None   # actual rows by category
    notes: str | None = None


class AuditOut(BaseModel):
    id: uuid.UUID
    name: str
    folder_id: uuid.UUID | None
    source_filename: str | None
    crawl_date: datetime | None
    url_count: int
    score: float | None
    summary: dict | None
    issues: dict | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditListItem(BaseModel):
    id: uuid.UUID
    name: str
    url_count: int
    score: float | None
    created_at: datetime

    class Config:
        from_attributes = True
