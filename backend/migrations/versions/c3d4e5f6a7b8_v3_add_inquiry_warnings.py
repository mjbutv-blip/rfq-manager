"""v3_add_inquiry_warnings

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-13 00:00:00.000000

新增 inquiry_warnings 预警表。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inquiry_warnings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_no", sa.Text(), nullable=False),
        sa.Column("warning_type", sa.Text(), nullable=False),
        sa.Column("warning_level", sa.Text(), nullable=False),
        sa.Column("warning_message", sa.Text(), nullable=False),
        sa.Column("field_name", sa.Text(), nullable=True),
        sa.Column("current_value", sa.Text(), nullable=True),
        sa.Column("suggested_action", sa.Text(), nullable=True),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inquiry_warnings_inquiry_id",  "inquiry_warnings", ["inquiry_id"])
    op.create_index("ix_inquiry_warnings_inquiry_no",  "inquiry_warnings", ["inquiry_no"])
    op.create_index("ix_inquiry_warnings_warning_type","inquiry_warnings", ["warning_type"])
    op.create_index("ix_inquiry_warnings_warning_level","inquiry_warnings", ["warning_level"])
    op.create_index("ix_inquiry_warnings_is_resolved", "inquiry_warnings", ["is_resolved"])


def downgrade() -> None:
    op.drop_table("inquiry_warnings")
