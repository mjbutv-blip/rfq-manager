"""v8_add_factories

Revision ID: h8b9c0d1e2f3
Revises: g7a8b9c0d1e2
Create Date: 2026-06-13 00:00:00.000000

新增 factories 工厂档案表和 factory_quote_records 工厂报价记录表。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h8b9c0d1e2f3"
down_revision: Union[str, None] = "g7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "factories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("factory_code", sa.Text(), nullable=False),
        sa.Column("factory_name", sa.Text(), nullable=True),
        sa.Column("factory_short_name", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("contact_person", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.Text(), nullable=True),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("main_categories", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("capability_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("certificate_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("price_position", sa.Text(), nullable=True),
        sa.Column("moq", sa.Integer(), nullable=True),
        sa.Column("normal_lead_time_days", sa.Integer(), nullable=True),
        sa.Column("payment_terms", sa.Text(), nullable=True),
        sa.Column("cooperation_status", sa.Text(), nullable=True),
        sa.Column("risk_level", sa.Text(), nullable=True),
        sa.Column("risk_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_factories_factory_code", "factories", ["factory_code"], unique=True)
    op.create_index("ix_factories_factory_name", "factories", ["factory_name"])
    op.create_index("ix_factories_factory_short_name", "factories", ["factory_short_name"])
    op.create_index("ix_factories_cooperation_status", "factories", ["cooperation_status"])
    op.create_index("ix_factories_risk_level", "factories", ["risk_level"])

    op.create_table(
        "factory_quote_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("factory_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("factory_name", sa.Text(), nullable=True),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inquiry_no", sa.Text(), nullable=True),
        sa.Column("product_category", sa.Text(), nullable=True),
        sa.Column("product_name", sa.Text(), nullable=True),
        sa.Column("series_name", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("factory_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("quote_date", sa.Date(), nullable=True),
        sa.Column("quote_status", sa.Text(), nullable=True),
        sa.Column("order_status", sa.Text(), nullable=True),
        sa.Column("is_ordered", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("trade_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["factory_id"], ["factories.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_factory_quote_records_factory_id", "factory_quote_records", ["factory_id"])
    op.create_index("ix_factory_quote_records_inquiry_id", "factory_quote_records", ["inquiry_id"])
    op.create_index("ix_factory_quote_records_inquiry_no", "factory_quote_records", ["inquiry_no"])
    op.create_index("ix_factory_quote_records_quote_date", "factory_quote_records", ["quote_date"])


def downgrade() -> None:
    op.drop_table("factory_quote_records")
    op.drop_table("factories")
