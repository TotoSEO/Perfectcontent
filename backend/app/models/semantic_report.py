from __future__ import annotations

import uuid
from datetime import datetime

from app.db_types import Vector
from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.indexed_page import EMBEDDING_DIM


class SemanticReport(Base):
    __tablename__ = "semantic_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serp_raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    related_keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    competitors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    common_subthemes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    rare_subthemes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    entities: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    required_terms: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    content_gaps: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    term_targets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    competitors_breakdown: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    expected_terms_embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
