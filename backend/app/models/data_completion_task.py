import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DataCompletionTask(Base):
    """
    资料补录任务（报价资料分析 Step 10）。

    一个任务对应一条 inquiry_item；一个款式同时只能有一条未关闭（open/in_progress）
    任务，由部分唯一索引 ux_data_completion_tasks_item_open 在数据库层保证。
    """

    __tablename__ = "data_completion_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inquiries.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    inquiry_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inquiry_items.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    # 第一版统一为 data_completion，不扩展其他任务类型
    task_type: Mapped[str] = mapped_column(Text, nullable=False, default="data_completion")
    missing_fields_json: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    # high | medium | low
    priority: Mapped[str] = mapped_column(Text, nullable=False, default="medium")
    # open | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open", index=True)
    assigned_to: Mapped[str | None] = mapped_column(Text, index=True)
    assigned_by: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    # 任务来源分析页面，例如 quote-data-quality / quote-analysis-overview
    source_module: Mapped[str] = mapped_column(Text, nullable=False)
    source_reason: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[str | None] = mapped_column(Text)
    closed_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
