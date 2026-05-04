"""batch_id + auto_validate_blueprint on jobs

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "auto_validate_blueprint",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_index("ix_jobs_batch_id", "jobs", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_batch_id", table_name="jobs")
    op.drop_column("jobs", "auto_validate_blueprint")
    op.drop_column("jobs", "batch_id")
