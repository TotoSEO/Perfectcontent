"""Schemas for the standalone semantic analysis tool."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SemanticAnalysisCreate(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=500)
    location_code: int = 2250
    language_code: str = "fr"


class SemanticAnalysisPatch(BaseModel):
    draft_html: str | None = None


class SemanticAnalysisListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword: str
    location_code: int
    language_code: str
    status: str
    error: str | None
    cost: float
    created_at: datetime
    updated_at: datetime


class SemanticAnalysisOut(SemanticAnalysisListItem):
    serp_raw: dict | None
    related_keywords: list | None
    competitors: list | None
    common_subthemes: list | None
    rare_subthemes: list | None
    entities: list | None
    content_gaps: list | None
    term_targets: list | None
    draft_html: str | None
