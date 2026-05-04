"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("hostname", sa.String(), nullable=False, unique=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("last_indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pages_count", sa.Integer(), server_default="0"),
        sa.Column("index_cost_usd", sa.Numeric(10, 4), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "contents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("domains.id"), nullable=True),
        sa.Column("keyword", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="analysis"),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("blueprint", postgresql.JSONB(), nullable=True),
        sa.Column("title_variants", postgresql.JSONB(), nullable=True),
        sa.Column("chosen_title", sa.Text(), nullable=True),
        sa.Column("chosen_meta", sa.Text(), nullable=True),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("image_prompt", sa.Text(), nullable=True),
        sa.Column("schema_recommendations", postgresql.JSONB(), nullable=True),
        sa.Column("internal_links", postgresql.JSONB(), nullable=True),
        sa.Column("coverage_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_contents_folder_id", "contents", ["folder_id"])
    op.create_index("ix_contents_domain_id", "contents", ["domain_id"])
    op.execute(
        "CREATE INDEX ix_contents_embedding ON contents USING ivfflat (embedding vector_cosine_ops) WITH (lists=50)"
    )

    op.create_table(
        "indexed_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("domains.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("h1", sa.Text(), nullable=True),
        sa.Column("meta_description", sa.Text(), nullable=True),
        sa.Column("first_paragraph", sa.Text(), nullable=True),
        sa.Column("full_content", sa.Text(), nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("domain_id", "url", name="uq_domain_url"),
    )
    op.create_index("ix_indexed_pages_domain_id", "indexed_pages", ["domain_id"])
    op.execute(
        "CREATE INDEX ix_indexed_pages_embedding ON indexed_pages USING ivfflat "
        "(embedding vector_cosine_ops) WITH (lists=100)"
    )

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("keyword", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("location_code", sa.Integer(), nullable=False),
        sa.Column("language_code", sa.String(), nullable=False),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("domains.id"), nullable=True),
        sa.Column("internal_linking", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("current_step", sa.String(), nullable=True),
        sa.Column("cost_estimate_low", sa.Numeric(10, 4), nullable=True),
        sa.Column("cost_estimate_high", sa.Numeric(10, 4), nullable=True),
        sa.Column("cost_actual", sa.Numeric(10, 4), server_default="0"),
        sa.Column("cost_cap", sa.Numeric(10, 4), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("audit", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_jobs_content_id", "jobs", ["content_id"])

    op.create_table(
        "semantic_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("serp_raw", postgresql.JSONB(), nullable=True),
        sa.Column("related_keywords", postgresql.JSONB(), nullable=True),
        sa.Column("competitors", postgresql.JSONB(), nullable=True),
        sa.Column("common_subthemes", postgresql.JSONB(), nullable=True),
        sa.Column("rare_subthemes", postgresql.JSONB(), nullable=True),
        sa.Column("entities", postgresql.JSONB(), nullable=True),
        sa.Column("required_terms", postgresql.JSONB(), nullable=True),
        sa.Column("content_gaps", postgresql.JSONB(), nullable=True),
        sa.Column("expected_terms_embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_semantic_reports_job_id", "semantic_reports", ["job_id"])

    op.create_table(
        "api_cache",
        sa.Column("cache_key", sa.String(), primary_key=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(10, 4), server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_api_cache_expires_at", "api_cache", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_api_cache_expires_at", table_name="api_cache")
    op.drop_table("api_cache")
    op.drop_index("ix_semantic_reports_job_id", table_name="semantic_reports")
    op.drop_table("semantic_reports")
    op.drop_index("ix_jobs_content_id", table_name="jobs")
    op.drop_table("jobs")
    op.execute("DROP INDEX IF EXISTS ix_indexed_pages_embedding")
    op.drop_index("ix_indexed_pages_domain_id", table_name="indexed_pages")
    op.drop_table("indexed_pages")
    op.execute("DROP INDEX IF EXISTS ix_contents_embedding")
    op.drop_index("ix_contents_domain_id", table_name="contents")
    op.drop_index("ix_contents_folder_id", table_name="contents")
    op.drop_table("contents")
    op.drop_table("domains")
    op.drop_table("folders")
