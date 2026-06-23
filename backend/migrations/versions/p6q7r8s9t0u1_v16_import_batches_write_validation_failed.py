"""v16 add validation_failed_rows / write_failed_rows to import_batches

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-06-21

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p6q7r8s9t0u1"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("import_batches", sa.Column("validation_failed_rows", sa.Integer(), nullable=True))
    op.add_column("import_batches", sa.Column("write_failed_rows", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_batches", "write_failed_rows")
    op.drop_column("import_batches", "validation_failed_rows")
