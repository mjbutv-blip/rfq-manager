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
    failed_rows: Mapped[int | None] = mapped_column(Integer)        # 解析失败/写入失败行数
    new_rows: Mapped[int | None] = mapped_column(Integer)           # 其中属于新增询单的行数
    existing_rows: Mapped[int | None] = mapped_column(Integer)      # 其中已存在（跳过）的行数
    duplicate_rows: Mapped[int | None] = mapped_column(Integer)     # 文件内部重复 inquiry_no 的行数

    # 状态：pending / success / partial / failed
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
