"""jobs.mode + jobs.source_content for rewrite mode

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("mode", sa.String(), nullable=False, server_default="standard"),
    )
    op.add_column("jobs", sa.Column("source_content", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "source_content")
    op.drop_column("jobs", "mode")
