"""v21 add order groups

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-07-13
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "v2w3x4y5z6a7"
down_revision: Union[str, None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("group_code", sa.Text(), nullable=False),
        sa.Column("group_name", sa.Text(), nullable=True),
        sa.Column("source_file_name", sa.Text(), nullable=True),
        sa.Column("source_sheet", sa.Text(), nullable=True),
        sa.Column("source_start_row", sa.Integer(), nullable=True),
        sa.Column("source_end_row", sa.Integer(), nullable=True),
        sa.Column("customer_code", sa.Text(), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("group_status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("group_code", name="uq_order_groups_group_code"),
    )
    op.create_index("ix_order_groups_group_code", "order_groups", ["group_code"])
    op.create_index("ix_order_groups_customer_code", "order_groups", ["customer_code"])
    op.create_index("ix_order_groups_group_status", "order_groups", ["group_status"])

    op.create_table(
        "order_group_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_no", sa.Text(), nullable=False),
        sa.Column("source_sheet", sa.Text(), nullable=True),
        sa.Column("source_row", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["order_group_id"], ["order_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("inquiry_id", name="uq_order_group_items_inquiry_id"),
    )
    op.create_index("ix_order_group_items_order_group_id", "order_group_items", ["order_group_id"])
    op.create_index("ix_order_group_items_inquiry_id", "order_group_items", ["inquiry_id"])
    op.create_index("ix_order_group_items_inquiry_no", "order_group_items", ["inquiry_no"])


def downgrade() -> None:
    op.drop_index("ix_order_group_items_inquiry_no", table_name="order_group_items")
    op.drop_index("ix_order_group_items_inquiry_id", table_name="order_group_items")
    op.drop_index("ix_order_group_items_order_group_id", table_name="order_group_items")
    op.drop_table("order_group_items")
    op.drop_index("ix_order_groups_group_status", table_name="order_groups")
    op.drop_index("ix_order_groups_customer_code", table_name="order_groups")
    op.drop_index("ix_order_groups_group_code", table_name="order_groups")
    op.drop_table("order_groups")
