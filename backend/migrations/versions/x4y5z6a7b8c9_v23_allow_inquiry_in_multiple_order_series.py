"""allow inquiry in multiple order series

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-07-19 16:00:00.000000
"""

from alembic import op


revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_order_series_items_inquiry_id", "order_series_items", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_order_series_items_inquiry_id", "order_series_items", ["inquiry_id"])
