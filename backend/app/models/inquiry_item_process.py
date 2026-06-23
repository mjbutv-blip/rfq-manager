import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InquiryItemProcess(Base):
    """款式工艺标签（一个款式可有多个标准化工艺标签）"""

    __tablename__ = "inquiry_item_processes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiry_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    process_tag: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    process_type: Mapped[str | None] = mapped_column(Text)
    is_special: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    inquiry_item: Mapped["InquiryItem"] = relationship("InquiryItem", back_populates="processes", lazy="noload")  # noqa: F821
