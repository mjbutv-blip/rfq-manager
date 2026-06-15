"""v10 add production_records

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-06-13

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "production_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("production_no", sa.Text(), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inquiry_no", sa.Text(), nullable=True),
        sa.Column("customer_code", sa.Text(), nullable=True),
        sa.Column("customer_short_name", sa.Text(), nullable=True),
        sa.Column("factory_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("factory_name", sa.Text(), nullable=True),
        sa.Column("product_category", sa.Text(), nullable=True),
        sa.Column("product_name", sa.Text(), nullable=True),
        sa.Column("series_name", sa.Text(), nullable=True),
        sa.Column("order_quantity", sa.Integer(), nullable=True),
        sa.Column("order_unit_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("trade_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("order_date", sa.Date(), nullable=True),
        sa.Column("delivery_date", sa.Date(), nullable=True),
        sa.Column("production_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("fabric_status", sa.Text(), nullable=True),
        sa.Column("accessory_status", sa.Text(), nullable=True),
        sa.Column("production_schedule_status", sa.Text(), nullable=True),
        sa.Column("first_inspection_status", sa.Text(), nullable=True),
        sa.Column("mid_inspection_status", sa.Text(), nullable=True),
        sa.Column("final_inspection_status", sa.Text(), nullable=True),
        sa.Column("delay_risk_level", sa.Text(), nullable=True),
        sa.Column("delay_reason", sa.Text(), nullable=True),
        sa.Column("actual_finish_date", sa.Date(), nullable=True),
        sa.Column("responsible_sales", sa.Text(), nullable=True),
        sa.Column("group_name", sa.Text(), nullable=True),
        sa.Column("merchandiser", sa.Text(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("production_no"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["factory_id"], ["factories.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_production_records_production_no",   "production_records", ["production_no"])
    op.create_index("ix_production_records_inquiry_id",      "production_records", ["inquiry_id"])
    op.create_index("ix_production_records_factory_id",      "production_records", ["factory_id"])
    op.create_index("ix_production_records_customer_code",   "production_records", ["customer_code"])
    op.create_index("ix_production_records_production_status", "production_records", ["production_status"])
    op.create_index("ix_production_records_delivery_date",   "production_records", ["delivery_date"])
    op.create_index("ix_production_records_responsible_sales", "production_records", ["responsible_sales"])
    op.create_index("ix_production_records_group_name",      "production_records", ["group_name"])


def downgrade() -> None:
    op.drop_table("production_records")
