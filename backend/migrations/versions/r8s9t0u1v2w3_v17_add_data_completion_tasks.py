"""v17 add data_completion_tasks

Revision ID: r8s9t0u1v2w3
Revises: p6q7r8s9t0u1
Create Date: 2026-06-23

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "r8s9t0u1v2w3"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_completion_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inquiry_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_type", sa.Text(), nullable=False, server_default="data_completion"),
        sa.Column("missing_fields_json", postgresql.JSONB(), nullable=False),
        sa.Column("priority", sa.Text(), nullable=False, server_default="medium"),
        sa.Column("status", sa.Text(), nullable=False, server_default="open"),
        sa.Column("assigned_to", sa.Text(), nullable=True),
        sa.Column("assigned_by", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column("source_module", sa.Text(), nullable=False),
        sa.Column("source_reason", sa.Text(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", sa.Text(), nullable=True),
        sa.Column("closed_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_item_id"], ["inquiry_items.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_data_completion_tasks_inquiry_id", "data_completion_tasks", ["inquiry_id"])
    op.create_index("ix_data_completion_tasks_inquiry_item_id", "data_completion_tasks", ["inquiry_item_id"])
    op.create_index("ix_data_completion_tasks_status", "data_completion_tasks", ["status"])
    op.create_index("ix_data_completion_tasks_priority", "data_completion_tasks", ["priority"])
    op.create_index("ix_data_completion_tasks_assigned_to", "data_completion_tasks", ["assigned_to"])
    op.create_index("ix_data_completion_tasks_due_date", "data_completion_tasks", ["due_date"])
    # 一个款式同时只能有一条"未关闭"（open/in_progress）任务，用部分唯一索引在数据库层兜底，
    # 不完全依赖应用层检查——避免并发请求下出现重复的未关闭任务。
    op.create_index(
        "ux_data_completion_tasks_item_open",
        "data_completion_tasks", ["inquiry_item_id"],
        unique=True,
        postgresql_where=sa.text("status in ('open', 'in_progress')"),
    )


def downgrade() -> None:
    op.drop_table("data_completion_tasks")
