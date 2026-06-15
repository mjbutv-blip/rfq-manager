"""v2_add_missing_indexes_and_fields

Revision ID: b2c3d4e5f6a7
Revises: 24bd995dc7ac
Create Date: 2026-06-12 00:00:00.000000

补充 import_batches 缺失字段和全部索引。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "24bd995dc7ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── import_batches 补充字段 ────────────────────────────────────────────────
    op.add_column("import_batches",
        sa.Column("new_rows", sa.Integer(), nullable=True))
    op.add_column("import_batches",
        sa.Column("existing_rows", sa.Integer(), nullable=True))
    op.add_column("import_batches",
        sa.Column("duplicate_rows", sa.Integer(), nullable=True))
    op.add_column("import_batches",
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False))

    # ── inquiries 补充索引 ─────────────────────────────────────────────────────
    op.create_index("ix_inquiries_customer_short_name", "inquiries", ["customer_short_name"])
    op.create_index("ix_inquiries_assisting_sales",     "inquiries", ["assisting_sales"])
    op.create_index("ix_inquiries_product_category",    "inquiries", ["product_category"])
    op.create_index("ix_inquiries_product_name",        "inquiries", ["product_name"])
    op.create_index("ix_inquiries_inquiry_date",        "inquiries", ["inquiry_date"])
    op.create_index("ix_inquiries_quote_status",        "inquiries", ["quote_status"])
    op.create_index("ix_inquiries_trade_amount",        "inquiries", ["trade_amount"])
    op.create_index("ix_inquiries_inquiry_month",       "inquiries", ["inquiry_month"])

    # ── inquiry_items 补充索引 ─────────────────────────────────────────────────
    op.create_index("ix_inquiry_items_series_name",       "inquiry_items", ["series_name"])
    op.create_index("ix_inquiry_items_product_category",  "inquiry_items", ["product_category"])
    op.create_index("ix_inquiry_items_product_name",      "inquiry_items", ["product_name"])

    # ── customers 补充索引 ─────────────────────────────────────────────────────
    op.create_index("ix_customers_customer_short_name", "customers", ["customer_short_name"])
    op.create_index("ix_customers_group_name",          "customers", ["group_name"])
    op.create_index("ix_customers_responsible_sales",   "customers", ["responsible_sales"])

    # ── users 补充索引 ─────────────────────────────────────────────────────────
    op.create_index("ix_users_username",    "users", ["username"])
    op.create_index("ix_users_group_name",  "users", ["group_name"])
    op.create_index("ix_users_role",        "users", ["role"])

    # ── groups 补充索引 ────────────────────────────────────────────────────────
    op.create_index("ix_groups_group_name", "groups", ["group_name"])

    # ── import_rows 补充索引 ───────────────────────────────────────────────────
    op.create_index("ix_import_rows_inquiry_no", "import_rows", ["inquiry_no"])
    op.create_index("ix_import_rows_status",     "import_rows", ["status"])


def downgrade() -> None:
    # import_rows
    op.drop_index("ix_import_rows_status",     table_name="import_rows")
    op.drop_index("ix_import_rows_inquiry_no", table_name="import_rows")

    # groups
    op.drop_index("ix_groups_group_name", table_name="groups")

    # users
    op.drop_index("ix_users_role",       table_name="users")
    op.drop_index("ix_users_group_name", table_name="users")
    op.drop_index("ix_users_username",   table_name="users")

    # customers
    op.drop_index("ix_customers_responsible_sales",   table_name="customers")
    op.drop_index("ix_customers_group_name",          table_name="customers")
    op.drop_index("ix_customers_customer_short_name", table_name="customers")

    # inquiry_items
    op.drop_index("ix_inquiry_items_product_name",     table_name="inquiry_items")
    op.drop_index("ix_inquiry_items_product_category", table_name="inquiry_items")
    op.drop_index("ix_inquiry_items_series_name",      table_name="inquiry_items")

    # inquiries
    op.drop_index("ix_inquiries_inquiry_month",       table_name="inquiries")
    op.drop_index("ix_inquiries_trade_amount",        table_name="inquiries")
    op.drop_index("ix_inquiries_quote_status",        table_name="inquiries")
    op.drop_index("ix_inquiries_inquiry_date",        table_name="inquiries")
    op.drop_index("ix_inquiries_product_name",        table_name="inquiries")
    op.drop_index("ix_inquiries_product_category",    table_name="inquiries")
    op.drop_index("ix_inquiries_assisting_sales",     table_name="inquiries")
    op.drop_index("ix_inquiries_customer_short_name", table_name="inquiries")

    # import_batches
    op.drop_column("import_batches", "updated_at")
    op.drop_column("import_batches", "duplicate_rows")
    op.drop_column("import_batches", "existing_rows")
    op.drop_column("import_batches", "new_rows")
