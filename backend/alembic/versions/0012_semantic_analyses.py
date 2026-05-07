"""semantic_analyses standalone table

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("keyword", sa.String(length=500), nullable=False),
        sa.Column("location_code", sa.Integer(), nullable=False, server_default=sa.text("2250")),
        sa.Column("language_code", sa.String(length=10), nullable=False, server_default=sa.text("'fr'")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("serp_raw", JSONB(), nullable=True),
        sa.Column("related_keywords", JSONB(), nullable=True),
        sa.Column("competitors", JSONB(), nullable=True),
        sa.Column("common_subthemes", JSONB(), nullable=True),
        sa.Column("rare_subthemes", JSONB(), nullable=True),
        sa.Column("entities", JSONB(), nullable=True),
        sa.Column("content_gaps", JSONB(), nullable=True),
        sa.Column("term_targets", JSONB(), nullable=True),
        sa.Column("draft_html", sa.Text(), nullable=True),
        sa.Column("cost", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_semantic_analyses_keyword", "semantic_analyses", ["keyword"])


def downgrade() -> None:
    op.drop_index("ix_semantic_analyses_keyword", table_name="semantic_analyses")
    op.drop_table("semantic_analyses")
