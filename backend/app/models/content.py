from __future__ import annotations

import uuid
from datetime import datetime

from app.db_types import Vector
from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.indexed_page import EMBEDDING_DIM


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("domains.id"), nullable=True, index=True
    )
    keyword: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="analysis")
    intent: Mapped[str | None] = mapped_column(String, nullable=True)

    blueprint: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    title_variants: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    chosen_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    chosen_meta: Mapped[str | None] = mapped_column(Text, nullable=True)

    html: Mapped[str | None] = mapped_column(Text, nullable=True)
    markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_recommendations: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    internal_links: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    coverage_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    silo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("silos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    silo_role: Mapped[str | None] = mapped_column(String, nullable=True)
    slug: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
