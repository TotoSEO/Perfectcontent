from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    folder_id: UUID | None
    domain_id: UUID | None
    keyword: str
    content_type: str
    status: str
    intent: str | None
    blueprint: dict | None
    title_variants: list | None
    chosen_title: str | None
    chosen_meta: str | None
    html: str | None
    markdown: str | None
    image_url: str | None
    schema_recommendations: dict | None
    internal_links: list | None
    coverage_score: float | None
    created_at: datetime
    updated_at: datetime


class ContentPatch(BaseModel):
    folder_id: UUID | None = None
    status: str | None = None
    chosen_title: str | None = None
    chosen_meta: str | None = None
    html: str | None = None
    markdown: str | None = None
