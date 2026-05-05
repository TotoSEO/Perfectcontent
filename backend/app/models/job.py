from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=True, index=True
    )
    keyword: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    location_code: Mapped[int] = mapped_column(Integer, nullable=False)
    language_code: Mapped[str] = mapped_column(String, nullable=False)
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("domains.id"), nullable=True
    )
    internal_linking: Mapped[bool] = mapped_column(Boolean, default=False)
    generate_image: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_validate_blueprint: Mapped[bool] = mapped_column(Boolean, default=False)
    mode: Mapped[str] = mapped_column(String, nullable=False, default="standard")
    source_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")
    current_step: Mapped[str | None] = mapped_column(String, nullable=True)

    cost_estimate_low: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    cost_estimate_high: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    cost_actual: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    cost_cap: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    audit: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
