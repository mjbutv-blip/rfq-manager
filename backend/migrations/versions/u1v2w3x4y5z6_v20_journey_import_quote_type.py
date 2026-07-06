"""v20 journey import quote type and quote_items

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-07-06
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, None] = "t0u1v2w3x4y5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quote_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quote_type", sa.Text(), nullable=False, server_default="domestic"),
        sa.Column("quote_round", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("order_quantity", sa.Integer(), nullable=True),
        sa.Column("calc_quantity", sa.Integer(), nullable=True),
        sa.Column("port_misc_fee_cny", sa.Numeric(10, 4), nullable=True),
        sa.Column("exchange_rate", sa.Numeric(8, 4), nullable=True),
        sa.Column("factory1_name", sa.Text(), nullable=True),
        sa.Column("factory1_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("factory2_name", sa.Text(), nullable=True),
        sa.Column("factory2_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("factory3_name", sa.Text(), nullable=True),
        sa.Column("factory3_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("lowest_factory", sa.Text(), nullable=True),
        sa.Column("lowest_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("second_lowest_factory", sa.Text(), nullable=True),
        sa.Column("second_lowest_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("net_profit_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("commission_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("selected_factory", sa.Text(), nullable=True),
        sa.Column("selected_factory_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("final_quote_usd", sa.Numeric(12, 4), nullable=True),
        sa.Column("customer_target_price_usd", sa.Numeric(12, 4), nullable=True),
        sa.Column("quote_vs_target_ratio", sa.Numeric(6, 4), nullable=True),
        sa.Column("target_gap_cny", sa.Numeric(10, 4), nullable=True),
        sa.Column("reverse_target_price_cny", sa.Numeric(12, 4), nullable=True),
        sa.Column("gross_profit_cny", sa.Numeric(14, 2), nullable=True),
        sa.Column("gross_profit_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("order_status", sa.Text(), nullable=True),
        sa.Column("current_exchange_rate", sa.Numeric(8, 4), nullable=True),
        sa.Column("trade_amount_usd", sa.Numeric(14, 2), nullable=True),
        sa.Column("quote_date", sa.Date(), nullable=True),
        sa.Column("quote_situation", sa.Text(), nullable=True),
        sa.Column("material_received_date", sa.Date(), nullable=True),
        sa.Column("factory_arranged_date", sa.Date(), nullable=True),
        sa.Column("client_quoted_date", sa.Date(), nullable=True),
        sa.Column("archive_email_done", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("price_tracking_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("inquiry_id", "quote_type", "quote_round", name="uq_quote_items_inquiry_type_round"),
    )
    op.create_index("ix_quote_items_inquiry_id", "quote_items", ["inquiry_id"])
    op.create_index("ix_quote_items_quote_type", "quote_items", ["quote_type"])
    op.create_index("ix_quote_items_quote_date", "quote_items", ["quote_date"])
    op.create_index("ix_quote_items_order_status", "quote_items", ["order_status"])

    op.add_column("factory_quote_records", sa.Column("quote_type", sa.Text(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("source_sheet", sa.Text(), nullable=True))
    op.add_column("factory_quote_records", sa.Column("source_cell", sa.Text(), nullable=True))
    op.create_index("ix_factory_quote_records_quote_type", "factory_quote_records", ["quote_type"])

    op.drop_index("ux_factory_quote_records_round", table_name="factory_quote_records")
    op.create_index(
        "ux_factory_quote_records_type_round_factory",
        "factory_quote_records",
        ["inquiry_id", "quote_type", "quote_round", "factory_id"],
        unique=True,
        postgresql_where=sa.text("factory_id IS NOT NULL AND quote_round IS NOT NULL"),
    )
    op.create_index(
        "ux_factory_quote_records_type_round_factory_name",
        "factory_quote_records",
        ["inquiry_id", "quote_type", "quote_round", sa.text("lower(factory_name)")],
        unique=True,
        postgresql_where=sa.text("factory_id IS NULL AND factory_name IS NOT NULL AND quote_round IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_factory_quote_records_type_round_factory_name", table_name="factory_quote_records")
    op.drop_index("ux_factory_quote_records_type_round_factory", table_name="factory_quote_records")
    op.create_index(
        "ux_factory_quote_records_round",
        "factory_quote_records", ["inquiry_id", "factory_id", "quote_round"],
        unique=True,
        postgresql_where=sa.text("factory_id IS NOT NULL AND quote_round IS NOT NULL"),
    )
    op.drop_index("ix_factory_quote_records_quote_type", table_name="factory_quote_records")
    op.drop_column("factory_quote_records", "source_cell")
    op.drop_column("factory_quote_records", "source_sheet")
    op.drop_column("factory_quote_records", "quote_type")

    op.drop_index("ix_quote_items_order_status", table_name="quote_items")
    op.drop_index("ix_quote_items_quote_date", table_name="quote_items")
    op.drop_index("ix_quote_items_quote_type", table_name="quote_items")
    op.drop_index("ix_quote_items_inquiry_id", table_name="quote_items")
    op.drop_table("quote_items")
