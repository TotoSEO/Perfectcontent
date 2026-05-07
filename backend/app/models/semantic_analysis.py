from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SemanticAnalysis(Base):
    """Standalone semantic analysis. Same SERP+term_freq pipeline as the
    content generator, but the user is composing prose against the targets
    in the editor instead of having Claude generate it."""
    __tablename__ = "semantic_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    location_code: Mapped[int] = mapped_column(Integer, nullable=False, default=2250)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False, default="fr")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    # queued | running | done | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SERP + corpus payload (kept for the SERP viewer modal)
    serp_raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    related_keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    competitors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    common_subthemes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    rare_subthemes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    entities: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    content_gaps: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # The 40 BM25-ranked targets (each with target/min/max/importance/surface_forms)
    term_targets: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # User's draft, persisted as the editor edits (debounced via PATCH)
    draft_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
