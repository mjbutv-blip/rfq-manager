import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ImportBatch(Base):
    """每次 Excel 上传的批次记录"""

    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(Text)           # 上传人（第一阶段可传 "demo_user"）
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 行数统计
    total_rows: Mapped[int | None] = mapped_column(Integer)         # Excel 总数据行数
    success_rows: Mapped[int | None] = mapped_column(Integer)       # 实际写入数据库的行数
    failed_rows: Mapped[int | None] = mapped_column(Integer)        # 兼容旧字段：validation_failed_rows + write_failed_rows 之和
    new_rows: Mapped[int | None] = mapped_column(Integer)           # 其中属于新增询单的行数
    existing_rows: Mapped[int | None] = mapped_column(Integer)      # 其中为已有询单追加新款式（existing_inquiry_new_item）的行数
    duplicate_rows: Mapped[int | None] = mapped_column(Integer)     # 同一询单号下重复款式明细（duplicate_item）的行数
    uncertain_rows: Mapped[int | None] = mapped_column(Integer)     # 已有询单但无法判断款式新旧（existing_inquiry_item_uncertain）的行数
    validation_failed_rows: Mapped[int | None] = mapped_column(Integer)  # 写库前就判定不可导入（权限/必填字段缺失等）
    write_failed_rows: Mapped[int | None] = mapped_column(Integer)       # 原本可导入，但实际写库时数据库异常

    # 状态：pending / success / partial / failed
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
