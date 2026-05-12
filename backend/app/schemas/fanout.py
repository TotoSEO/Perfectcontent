"""Schemas for the Query Fan-Out tool."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FanoutCreate(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=500)
    # List of model ids: chat_gpt, claude, gemini, perplexity
    models: list[str] = Field(default_factory=lambda: ["chat_gpt", "gemini", "perplexity"])
    country_iso: str | None = "FR"


class FanoutListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword: str
    country_iso: str | None
    models: str
    status: str
    error: str | None
    cost: float
    created_at: datetime
    updated_at: datetime


class FanoutOut(FanoutListItem):
    responses: list | None
    unique_queries: list | None
    citations: list | None
