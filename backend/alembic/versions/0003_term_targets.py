"""term_targets JSONB on semantic_reports

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "semantic_reports",
        sa.Column("term_targets", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("semantic_reports", "term_targets")
