import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InquiryItemSize(Base):
    """款式标准化尺码（一个款式可有多个尺码，原始范围保留在 InquiryItem.size_range）"""

    __tablename__ = "inquiry_item_sizes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiry_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    size_code: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    is_special_size: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    inquiry_item: Mapped["InquiryItem"] = relationship("InquiryItem", back_populates="sizes", lazy="noload")  # noqa: F821
