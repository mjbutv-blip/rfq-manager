"""extend quote_items first round fields

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-08-03 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quote_items", sa.Column("batch_shipment_count", sa.Numeric(10, 4), nullable=True))
    op.add_column("quote_items", sa.Column("test_fee_cny", sa.Numeric(10, 4), nullable=True))
    op.add_column("quote_items", sa.Column("misc_fee_cny", sa.Numeric(10, 4), nullable=True))
    op.add_column("quote_items", sa.Column("included_other_fee_cny", sa.Numeric(10, 4), nullable=True))
    op.add_column("quote_items", sa.Column("pieces_per_card", sa.Integer(), nullable=True))
    op.add_column("quote_items", sa.Column("destination_port_count", sa.Integer(), nullable=True))
    op.add_column("quote_items", sa.Column("target_profit_value", sa.Numeric(12, 4), nullable=True))
    op.add_column("quote_items", sa.Column("target_price_gap_usd", sa.Numeric(10, 4), nullable=True))
    op.add_column("quote_items", sa.Column("reverse_target_profit_value", sa.Numeric(12, 4), nullable=True))
    op.add_column("quote_items", sa.Column("target_gross_profit_cny", sa.Numeric(14, 2), nullable=True))
    op.add_column("quote_items", sa.Column("target_trade_amount_usd", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("quote_items", "target_trade_amount_usd")
    op.drop_column("quote_items", "target_gross_profit_cny")
    op.drop_column("quote_items", "reverse_target_profit_value")
    op.drop_column("quote_items", "target_price_gap_usd")
    op.drop_column("quote_items", "target_profit_value")
    op.drop_column("quote_items", "destination_port_count")
    op.drop_column("quote_items", "pieces_per_card")
    op.drop_column("quote_items", "included_other_fee_cny")
    op.drop_column("quote_items", "misc_fee_cny")
    op.drop_column("quote_items", "test_fee_cny")
    op.drop_column("quote_items", "batch_shipment_count")
