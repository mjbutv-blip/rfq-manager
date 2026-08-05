"""v25 add factory risk notes

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-08-05

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "z6a7b8c9d0e1"
down_revision = "y5z6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("factories", sa.Column("risk_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("factories", "risk_notes")
