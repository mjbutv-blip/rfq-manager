"""v15 add uncertain_rows to import_batches (existing_inquiry_item_uncertain count)

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-06-21

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("import_batches", sa.Column("uncertain_rows", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_batches", "uncertain_rows")
