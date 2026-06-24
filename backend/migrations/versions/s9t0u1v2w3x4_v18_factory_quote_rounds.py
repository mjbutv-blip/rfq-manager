"""v18 factory_quote_records add quote_round/currency/price_unit/quoted_by/quoted_at

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-06-24

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("factory_quote_records", sa.Column("quote_round", sa.Integer(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("currency", sa.Text(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("price_unit", sa.Text(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("quoted_by", sa.Text(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("quoted_at", sa.DateTime(timezone=True), nullable=True))

    # 历史导入的记录没有"工厂档案"也应该允许保存（只存 factory_name），
    # 放宽外键为可空——不影响已有数据（都已经有 factory_id）。
    op.alter_column("factory_quote_records", "factory_id", nullable=True)

    op.create_index("ix_factory_quote_records_quote_round", "factory_quote_records", ["quote_round"])

    # 同一询单 + 同一工厂 + 同一轮次只能有一条"按轮次填报"的记录；旧的导入快照
    # 记录 quote_round 都是 NULL，不受这个唯一索引约束（Postgres 唯一索引允许多个 NULL）。
    op.create_index(
        "ux_factory_quote_records_round",
        "factory_quote_records", ["inquiry_id", "factory_id", "quote_round"],
        unique=True,
        postgresql_where=sa.text("factory_id IS NOT NULL AND quote_round IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_factory_quote_records_round", table_name="factory_quote_records")
    op.drop_index("ix_factory_quote_records_quote_round", table_name="factory_quote_records")
    op.alter_column("factory_quote_records", "factory_id", nullable=False)
    op.drop_column("factory_quote_records", "quoted_at")
    op.drop_column("factory_quote_records", "quoted_by")
    op.drop_column("factory_quote_records", "price_unit")
    op.drop_column("factory_quote_records", "currency")
    op.drop_column("factory_quote_records", "quote_round")
