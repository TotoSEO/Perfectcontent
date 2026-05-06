"""do_refinement + do_schema_jsonld toggles on jobs

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("do_refinement", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "jobs",
        sa.Column("do_schema_jsonld", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    from sqlalchemy.dialects.postgresql import JSONB
    op.add_column("semantic_reports", sa.Column("competitors_breakdown", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("semantic_reports", "competitors_breakdown")
    op.drop_column("jobs", "do_schema_jsonld")
    op.drop_column("jobs", "do_refinement")
