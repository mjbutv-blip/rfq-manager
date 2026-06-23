"""v14 add quote analysis item-level fields (style_no/quote_prepared_by/process_description/extra_data)
and inquiry_item_processes / inquiry_item_sizes tables

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-06-21

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── inquiry_items 新增字段（全部可空，不动现有数据）────────────────────────
    op.add_column("inquiry_items", sa.Column("style_no", sa.Text(), nullable=True))
    op.add_column("inquiry_items", sa.Column("quote_prepared_by", sa.Text(), nullable=True))
    op.add_column("inquiry_items", sa.Column("process_description", sa.Text(), nullable=True))
    op.add_column("inquiry_items", sa.Column("extra_data", postgresql.JSONB(), nullable=True))

    op.create_index("ix_inquiry_items_style_no", "inquiry_items", ["style_no"])
    op.create_index("ix_inquiry_items_quote_prepared_by", "inquiry_items", ["quote_prepared_by"])

    # ── inquiry_item_processes（工艺标签，一个款式可有多个）─────────────────────
    op.create_table(
        "inquiry_item_processes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("process_tag", sa.Text(), nullable=False),
        sa.Column("process_type", sa.Text(), nullable=True),
        sa.Column("is_special", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["inquiry_item_id"], ["inquiry_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inquiry_item_processes_inquiry_item_id",
        "inquiry_item_processes", ["inquiry_item_id"],
    )
    op.create_index(
        "ix_inquiry_item_processes_process_tag",
        "inquiry_item_processes", ["process_tag"],
    )

    # ── inquiry_item_sizes（标准化尺码，一个款式可有多个）───────────────────────
    op.create_table(
        "inquiry_item_sizes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("size_code", sa.Text(), nullable=False),
        sa.Column("is_special_size", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["inquiry_item_id"], ["inquiry_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inquiry_item_sizes_inquiry_item_id",
        "inquiry_item_sizes", ["inquiry_item_id"],
    )
    op.create_index(
        "ix_inquiry_item_sizes_size_code",
        "inquiry_item_sizes", ["size_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_inquiry_item_sizes_size_code", table_name="inquiry_item_sizes")
    op.drop_index("ix_inquiry_item_sizes_inquiry_item_id", table_name="inquiry_item_sizes")
    op.drop_table("inquiry_item_sizes")

    op.drop_index("ix_inquiry_item_processes_process_tag", table_name="inquiry_item_processes")
    op.drop_index("ix_inquiry_item_processes_inquiry_item_id", table_name="inquiry_item_processes")
    op.drop_table("inquiry_item_processes")

    op.drop_index("ix_inquiry_items_quote_prepared_by", table_name="inquiry_items")
    op.drop_index("ix_inquiry_items_style_no", table_name="inquiry_items")
    op.drop_column("inquiry_items", "extra_data")
    op.drop_column("inquiry_items", "process_description")
    op.drop_column("inquiry_items", "quote_prepared_by")
    op.drop_column("inquiry_items", "style_no")
