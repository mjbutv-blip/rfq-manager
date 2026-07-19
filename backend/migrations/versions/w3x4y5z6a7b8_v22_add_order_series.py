"""v22 add order series

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-07-19
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, None] = "v2w3x4y5z6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_series",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("series_code", sa.Text(), nullable=False),
        sa.Column("series_name", sa.Text(), nullable=True),
        sa.Column("source_file_name", sa.Text(), nullable=True),
        sa.Column("source_sheet", sa.Text(), nullable=True),
        sa.Column("source_start_row", sa.Integer(), nullable=True),
        sa.Column("source_end_row", sa.Integer(), nullable=True),
        sa.Column("customer_code", sa.Text(), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("series_code", name="uq_order_series_series_code"),
    )
    op.create_index("ix_order_series_series_code", "order_series", ["series_code"])
    op.create_index("ix_order_series_series_name", "order_series", ["series_name"])
    op.create_index("ix_order_series_customer_code", "order_series", ["customer_code"])
    op.create_index("ix_order_series_series_status", "order_series", ["series_status"])

    op.create_table(
        "order_series_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_series_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_no", sa.Text(), nullable=False),
        sa.Column("source_sheet", sa.Text(), nullable=True),
        sa.Column("source_row", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["order_series_id"], ["order_series.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("inquiry_id", name="uq_order_series_items_inquiry_id"),
    )
    op.create_index("ix_order_series_items_order_series_id", "order_series_items", ["order_series_id"])
    op.create_index("ix_order_series_items_inquiry_id", "order_series_items", ["inquiry_id"])
    op.create_index("ix_order_series_items_inquiry_no", "order_series_items", ["inquiry_no"])

    op.add_column("order_groups", sa.Column("order_series_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_order_groups_order_series_id",
        "order_groups",
        "order_series",
        ["order_series_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_order_groups_order_series_id", "order_groups", ["order_series_id"])


def downgrade() -> None:
    op.drop_index("ix_order_groups_order_series_id", table_name="order_groups")
    op.drop_constraint("fk_order_groups_order_series_id", "order_groups", type_="foreignkey")
    op.drop_column("order_groups", "order_series_id")

    op.drop_index("ix_order_series_items_inquiry_no", table_name="order_series_items")
    op.drop_index("ix_order_series_items_inquiry_id", table_name="order_series_items")
    op.drop_index("ix_order_series_items_order_series_id", table_name="order_series_items")
    op.drop_table("order_series_items")

    op.drop_index("ix_order_series_series_status", table_name="order_series")
    op.drop_index("ix_order_series_customer_code", table_name="order_series")
    op.drop_index("ix_order_series_series_name", table_name="order_series")
    op.drop_index("ix_order_series_series_code", table_name="order_series")
    op.drop_table("order_series")
