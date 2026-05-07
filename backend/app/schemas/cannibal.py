"""Schemas for the cannibalization auditor."""
from __future__ import annotations

from pydantic import BaseModel, Field, HttpUrl


class GscIn(BaseModel):
    clicks: int | None = Field(None, ge=0)
    impressions: int | None = Field(None, ge=0)
    position: float | None = Field(None, ge=0, le=200)
    ctr: float | None = Field(None, ge=0, le=1)


class CannibalAuditIn(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=500)
    url_a: HttpUrl
    url_b: HttpUrl
    location_code: int = 2250
    language_code: str = "fr"
    gsc_a: GscIn | None = None
    gsc_b: GscIn | None = None
    backlinks_a: int | None = Field(None, ge=0)
    backlinks_b: int | None = Field(None, ge=0)
