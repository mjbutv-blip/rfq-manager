import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # 操作人
    actor_username: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    actor_display_name: Mapped[str | None] = mapped_column(Text)
    actor_role: Mapped[str | None] = mapped_column(Text)

    # 操作类型
    action_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_id: Mapped[str | None] = mapped_column(Text)  # UUID 转 str，允许非 UUID target

    # 关联询单（可空，用于非询单操作）
    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    inquiry_no: Mapped[str | None] = mapped_column(Text, index=True)

    # 描述
    description: Mapped[str | None] = mapped_column(Text)

    # 修改前后快照（JSONB 只存关键字段）
    before_data_json: Mapped[dict | None] = mapped_column(JSONB)
    after_data_json: Mapped[dict | None] = mapped_column(JSONB)

    # 请求上下文
    request_path: Mapped[str | None] = mapped_column(Text)
    request_method: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(Text)

    # 结果
    status: Mapped[str] = mapped_column(Text, nullable=False, default="success", index=True)
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
