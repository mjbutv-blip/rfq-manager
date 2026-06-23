import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InquiryItem(Base):
    """询单明细（一个询单可包含多个产品/款式）"""

    __tablename__ = "inquiry_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inquiry_no: Mapped[str | None] = mapped_column(Text, index=True)
    product_name: Mapped[str | None] = mapped_column(Text)
    product_category: Mapped[str | None] = mapped_column(Text)
    series_name: Mapped[str | None] = mapped_column(Text)
    fabric_quality: Mapped[str | None] = mapped_column(Text)
    color_print: Mapped[str | None] = mapped_column(Text)
    size_range: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int | None] = mapped_column(Integer)
    quote_status: Mapped[str | None] = mapped_column(Text)
    order_status: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)

    # 报价资料分析相关字段（款式级，详见字段审计报告）
    style_no: Mapped[str | None] = mapped_column(Text, index=True)
    quote_prepared_by: Mapped[str | None] = mapped_column(Text, index=True)
    process_description: Mapped[str | None] = mapped_column(Text)
    extra_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    inquiry: Mapped["Inquiry"] = relationship("Inquiry", back_populates="items", lazy="noload")  # noqa: F821
    processes: Mapped[list["InquiryItemProcess"]] = relationship(  # noqa: F821
        "InquiryItemProcess", back_populates="inquiry_item",
        cascade="all, delete-orphan", lazy="noload",
    )
    sizes: Mapped[list["InquiryItemSize"]] = relationship(  # noqa: F821
        "InquiryItemSize", back_populates="inquiry_item",
        cascade="all, delete-orphan", lazy="noload",
    )
