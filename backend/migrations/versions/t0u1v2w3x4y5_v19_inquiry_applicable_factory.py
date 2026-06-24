"""v19 inquiries add applicable_factory_id

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-06-24

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "t0u1v2w3x4y5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # "适用工厂"——单个订单来龙去脉表用，业务人员手动指定，不会被任何报价
    # 比较逻辑自动改写。工厂被删除时只解除关联，不级联删除询单。
    op.add_column(
        "inquiries",
        sa.Column("applicable_factory_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_inquiries_applicable_factory_id",
        "inquiries", "factories",
        ["applicable_factory_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_inquiries_applicable_factory_id", "inquiries", ["applicable_factory_id"])


def downgrade() -> None:
    op.drop_index("ix_inquiries_applicable_factory_id", table_name="inquiries")
    op.drop_constraint("fk_inquiries_applicable_factory_id", "inquiries", type_="foreignkey")
    op.drop_column("inquiries", "applicable_factory_id")
