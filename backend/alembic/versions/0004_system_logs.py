"""system_logs table for the in-app debug console

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.text("now()"), index=True),
        sa.Column("level", sa.String(length=10), nullable=False, index=True),
        sa.Column("module", sa.String(length=80)),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("system_logs")
