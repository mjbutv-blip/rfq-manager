"""v7_extend_customers

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-13 00:00:00.000000

为 customers 表新增档案字段：等级、标签、付款方式、价格偏好、跟进备注。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "g7a8b9c0d1e2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("customer_level", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("customer_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("customers", sa.Column("payment_terms", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("price_preference", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("follow_up_note", sa.Text(), nullable=True))
    # 非唯一索引，仅在不存在时创建（避免与旧迁移冲突）
    op.execute("CREATE INDEX IF NOT EXISTS ix_customers_customer_short_name ON customers (customer_short_name)")


def downgrade() -> None:
    op.drop_index("ix_customers_customer_short_name", table_name="customers")
    op.drop_column("customers", "follow_up_note")
    op.drop_column("customers", "price_preference")
    op.drop_column("customers", "payment_terms")
    op.drop_column("customers", "customer_tags")
    op.drop_column("customers", "customer_level")
