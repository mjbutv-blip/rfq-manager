"""v6_add_operation_logs

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-13 00:00:00.000000

新增 operation_logs 表，记录关键操作的操作人、时间、前后数据。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operation_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_username", sa.Text(), nullable=False),
        sa.Column("actor_display_name", sa.Text(), nullable=True),
        sa.Column("actor_role", sa.Text(), nullable=True),
        sa.Column("action_type", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=True),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inquiry_no", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("before_data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("request_path", sa.Text(), nullable=True),
        sa.Column("request_method", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="success"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_operation_logs_actor_username", "operation_logs", ["actor_username"])
    op.create_index("ix_operation_logs_action_type",   "operation_logs", ["action_type"])
    op.create_index("ix_operation_logs_inquiry_id",    "operation_logs", ["inquiry_id"])
    op.create_index("ix_operation_logs_inquiry_no",    "operation_logs", ["inquiry_no"])
    op.create_index("ix_operation_logs_status",        "operation_logs", ["status"])
    op.create_index("ix_operation_logs_created_at",    "operation_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_operation_logs_created_at",    table_name="operation_logs")
    op.drop_index("ix_operation_logs_status",        table_name="operation_logs")
    op.drop_index("ix_operation_logs_inquiry_no",    table_name="operation_logs")
    op.drop_index("ix_operation_logs_inquiry_id",    table_name="operation_logs")
    op.drop_index("ix_operation_logs_action_type",   table_name="operation_logs")
    op.drop_index("ix_operation_logs_actor_username", table_name="operation_logs")
    op.drop_table("operation_logs")
