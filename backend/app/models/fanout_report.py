from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FanoutReport(Base):
    """Query Fan-Out analysis from DataForSEO's LLM Responses API.

    For a single keyword, queries one or more LLMs (ChatGPT, Claude, Gemini,
    Perplexity) with web_search enabled and persists the surfaced
    `fan_out_queries` + annotations (cited URLs). The aggregated unique queries
    drive new content briefs.
    """
    __tablename__ = "fanout_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    country_iso: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # comma-separated list of model ids actually queried (chat_gpt, claude, gemini, perplexity)
    models: Mapped[str] = mapped_column(String(120), nullable=False, default="")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    # queued | running | done | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # per-model raw responses (text + queries + annotations + tokens/cost)
    responses: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # aggregated dedup'd queries across models, sorted by overlap
    unique_queries: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # aggregated dedup'd citations
    citations: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
