"""v4_warning_resolved_note

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-13 12:00:00.000000

给 inquiry_warnings 加 resolved_note 字段。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inquiry_warnings", sa.Column("resolved_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("inquiry_warnings", "resolved_note")
