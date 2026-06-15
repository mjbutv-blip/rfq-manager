"""v5_add_transfer_orders

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-13 00:00:00.000000

新增 transfer_orders 表，记录一键转单历史。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transfer_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_no", sa.Text(), nullable=False),
        sa.Column("transfer_status", sa.Text(), nullable=False, server_default="generated"),
        sa.Column("generated_by", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("factory_contract_file", sa.Text(), nullable=True),
        sa.Column("finance_transfer_file", sa.Text(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfer_orders_inquiry_id", "transfer_orders", ["inquiry_id"])
    op.create_index("ix_transfer_orders_inquiry_no", "transfer_orders", ["inquiry_no"])


def downgrade() -> None:
    op.drop_index("ix_transfer_orders_inquiry_no", table_name="transfer_orders")
    op.drop_index("ix_transfer_orders_inquiry_id", table_name="transfer_orders")
    op.drop_table("transfer_orders")
