from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ContentType = Literal["blog", "category", "product", "service_lp"]
JobStatus = Literal["queued", "running", "paused", "done", "failed", "capped"]


class JobEstimateIn(BaseModel):
    keyword: str
    content_type: ContentType
    location_code: int = 2250  # France default
    language_code: str = "fr"
    domain_id: UUID | None = None
    internal_linking: bool = False


class JobEstimateOut(BaseModel):
    low: float
    high: float


class JobCreateIn(JobEstimateIn):
    cost_cap: float | None = Field(default=None)
    folder_id: UUID | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    content_id: UUID | None
    keyword: str
    content_type: str
    location_code: int
    language_code: str
    domain_id: UUID | None
    internal_linking: bool
    status: str
    current_step: str | None
    cost_estimate_low: float | None
    cost_estimate_high: float | None
    cost_actual: float
    cost_cap: float | None
    error: str | None
    audit: dict
    created_at: datetime
    updated_at: datetime


class BlueprintEditIn(BaseModel):
    blueprint: dict


class CannibalizationIn(BaseModel):
    keyword: str
    domain_id: UUID
