import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderSeries(Base):
    __tablename__ = "order_series"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    series_name: Mapped[str | None] = mapped_column(Text, index=True)
    source_file_name: Mapped[str | None] = mapped_column(Text)
    source_sheet: Mapped[str | None] = mapped_column(Text)
    source_start_row: Mapped[int | None] = mapped_column(Integer)
    source_end_row: Mapped[int | None] = mapped_column(Integer)
    customer_code: Mapped[str | None] = mapped_column(Text, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"))
    series_status: Mapped[str] = mapped_column(Text, nullable=False, default="active", index=True)
    created_by: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items: Mapped[list["OrderSeriesItem"]] = relationship(  # noqa: F821
        "OrderSeriesItem", back_populates="order_series", cascade="all, delete-orphan", lazy="noload"
    )


class OrderSeriesItem(Base):
    __tablename__ = "order_series_items"
    __table_args__ = (
        UniqueConstraint("inquiry_id", name="uq_order_series_items_inquiry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_series_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_no: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    source_sheet: Mapped[str | None] = mapped_column(Text)
    source_row: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_confirmed: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    order_series: Mapped[OrderSeries] = relationship("OrderSeries", back_populates="items", lazy="noload")


class OrderGroup(Base):
    __tablename__ = "order_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    group_name: Mapped[str | None] = mapped_column(Text)
    source_file_name: Mapped[str | None] = mapped_column(Text)
    source_sheet: Mapped[str | None] = mapped_column(Text)
    source_start_row: Mapped[int | None] = mapped_column(Integer)
    source_end_row: Mapped[int | None] = mapped_column(Integer)
    order_series_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("order_series.id", ondelete="SET NULL"), index=True)
    customer_code: Mapped[str | None] = mapped_column(Text, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"))
    group_status: Mapped[str] = mapped_column(Text, nullable=False, default="active", index=True)
    created_by: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items: Mapped[list["OrderGroupItem"]] = relationship(  # noqa: F821
        "OrderGroupItem", back_populates="order_group", cascade="all, delete-orphan", lazy="noload"
    )


class OrderGroupItem(Base):
    __tablename__ = "order_group_items"
    __table_args__ = (
        UniqueConstraint("inquiry_id", name="uq_order_group_items_inquiry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_no: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    source_sheet: Mapped[str | None] = mapped_column(Text)
    source_row: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_confirmed: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    order_group: Mapped[OrderGroup] = relationship("OrderGroup", back_populates="items", lazy="noload")
