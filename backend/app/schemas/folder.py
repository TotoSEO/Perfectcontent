from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FolderIn(BaseModel):
    name: str
    parent_id: UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: UUID | None = None


class FolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    parent_id: UUID | None
    name: str
    created_at: datetime
