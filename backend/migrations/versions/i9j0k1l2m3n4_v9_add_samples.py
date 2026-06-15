"""v9 add sample_records

Revision ID: i9j0k1l2m3n4
Revises: h8b9c0d1e2f3
Create Date: 2026-06-13

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "i9j0k1l2m3n4"
down_revision = "h8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sample_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sample_no", sa.Text(), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inquiry_no", sa.Text(), nullable=True),
        sa.Column("customer_code", sa.Text(), nullable=True),
        sa.Column("customer_short_name", sa.Text(), nullable=True),
        sa.Column("factory_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("factory_name", sa.Text(), nullable=True),
        sa.Column("product_category", sa.Text(), nullable=True),
        sa.Column("product_name", sa.Text(), nullable=True),
        sa.Column("series_name", sa.Text(), nullable=True),
        sa.Column("sample_type", sa.Text(), nullable=True),
        sa.Column("sample_quantity", sa.Integer(), nullable=True),
        sa.Column("sample_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("assigned_to_factory_at", sa.Date(), nullable=True),
        sa.Column("factory_due_date", sa.Date(), nullable=True),
        sa.Column("sample_sent_at", sa.Date(), nullable=True),
        sa.Column("courier_company", sa.Text(), nullable=True),
        sa.Column("tracking_no", sa.Text(), nullable=True),
        sa.Column("customer_received_at", sa.Date(), nullable=True),
        sa.Column("customer_feedback", sa.Text(), nullable=True),
        sa.Column("revision_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_result", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("sample_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("fee_paid_by", sa.Text(), nullable=True),
        sa.Column("fee_payment_status", sa.Text(), nullable=True),
        sa.Column("responsible_sales", sa.Text(), nullable=True),
        sa.Column("group_name", sa.Text(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sample_no"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["factory_id"], ["factories.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_sample_records_sample_no",      "sample_records", ["sample_no"])
    op.create_index("ix_sample_records_inquiry_id",     "sample_records", ["inquiry_id"])
    op.create_index("ix_sample_records_factory_id",     "sample_records", ["factory_id"])
    op.create_index("ix_sample_records_customer_code",  "sample_records", ["customer_code"])
    op.create_index("ix_sample_records_sample_status",  "sample_records", ["sample_status"])
    op.create_index("ix_sample_records_factory_due_date", "sample_records", ["factory_due_date"])
    op.create_index("ix_sample_records_responsible_sales", "sample_records", ["responsible_sales"])
    op.create_index("ix_sample_records_group_name",     "sample_records", ["group_name"])


def downgrade() -> None:
    op.drop_table("sample_records")
