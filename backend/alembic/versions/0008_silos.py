"""silos table + silo cols on contents

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "silos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("pillar_keyword", sa.Text(), nullable=True),
        sa.Column(
            "pillar_content_id",
            UUID(as_uuid=True),
            sa.ForeignKey("contents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("pillar_external_url", sa.Text(), nullable=True),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("trailing_slash", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("domain_id", UUID(as_uuid=True), sa.ForeignKey("domains.id"), nullable=True),
        sa.Column("folder_id", UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("batch_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="planning"),
        sa.Column("mesh_audit", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("contents", sa.Column("silo_id", UUID(as_uuid=True), nullable=True))
    op.add_column("contents", sa.Column("silo_role", sa.String(), nullable=True))
    op.add_column("contents", sa.Column("slug", sa.Text(), nullable=True))
    op.add_column("contents", sa.Column("link_manifest", JSONB(), nullable=True))
    op.create_foreign_key(
        "fk_contents_silo_id",
        "contents",
        "silos",
        ["silo_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_contents_silo_id", "contents", ["silo_id"])


def downgrade() -> None:
    op.drop_index("ix_contents_silo_id", table_name="contents")
    op.drop_constraint("fk_contents_silo_id", "contents", type_="foreignkey")
    op.drop_column("contents", "link_manifest")
    op.drop_column("contents", "slug")
    op.drop_column("contents", "silo_role")
    op.drop_column("contents", "silo_id")
    op.drop_table("silos")
