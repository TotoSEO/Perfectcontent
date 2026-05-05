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
    auto_validate_blueprint: bool = False


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
    generate_image: bool
    auto_validate_blueprint: bool
    batch_id: UUID | None
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


class BatchItemIn(BaseModel):
    keyword: str
    content_type: ContentType
    # Per-row overrides. If None, the batch-level value applies.
    internal_linking: bool | None = None
    generate_image: bool | None = None


class JobBatchCreateIn(BaseModel):
    items: list[BatchItemIn] = Field(..., min_length=1)
    location_code: int = 2250
    language_code: str = "fr"
    domain_id: UUID | None = None
    folder_id: UUID | None = None
    internal_linking: bool = False
    generate_image: bool = False
    auto_validate_blueprint: bool = True
    cost_cap: float | None = None


class JobBatchEstimateOut(BaseModel):
    items: int
    low_total: float
    high_total: float


class BatchOut(BaseModel):
    batch_id: UUID
    jobs: list[JobOut]


class BlueprintEditIn(BaseModel):
    blueprint: dict


class CannibalizationIn(BaseModel):
    keyword: str
    domain_id: UUID


class RegenerateSectionIn(BaseModel):
    section_id: str


class RewriteJobIn(BaseModel):
    keyword: str
    source_content: str  # raw HTML pasted by the user (sanitized server-side)
    content_type: ContentType = "blog"
    location_code: int = 2250
    language_code: str = "fr"
    domain_id: UUID | None = None
    folder_id: UUID | None = None
    internal_linking: bool = False
    cost_cap: float | None = None
