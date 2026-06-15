import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductionRecord(Base):
    __tablename__ = "production_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    production_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inquiries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    inquiry_no: Mapped[str | None] = mapped_column(Text, index=True)
    customer_code: Mapped[str | None] = mapped_column(Text, index=True)
    customer_short_name: Mapped[str | None] = mapped_column(Text)
    factory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("factories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    factory_name: Mapped[str | None] = mapped_column(Text)

    product_category: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(Text)
    series_name: Mapped[str | None] = mapped_column(Text)

    order_quantity: Mapped[int | None] = mapped_column(Integer)
    order_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    trade_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    order_date: Mapped[date | None] = mapped_column(Date)
    delivery_date: Mapped[date | None] = mapped_column(Date, index=True)

    # pending | scheduled | materials_preparing | in_production | inspection
    # | ready_to_ship | shipped | completed | delayed | cancelled
    production_status: Mapped[str] = mapped_column(Text, nullable=False, default="pending", index=True)

    # not_started | ordered | in_progress | received | issue
    fabric_status: Mapped[str | None] = mapped_column(Text)
    # not_started | ordered | in_progress | received | issue
    accessory_status: Mapped[str | None] = mapped_column(Text)
    # not_scheduled | scheduled | in_progress | completed | delayed
    production_schedule_status: Mapped[str | None] = mapped_column(Text)

    # not_required | pending | in_progress | passed | failed
    first_inspection_status: Mapped[str | None] = mapped_column(Text)
    mid_inspection_status: Mapped[str | None] = mapped_column(Text)
    final_inspection_status: Mapped[str | None] = mapped_column(Text)

    # none | low | medium | high
    delay_risk_level: Mapped[str | None] = mapped_column(Text)
    delay_reason: Mapped[str | None] = mapped_column(Text)
    actual_finish_date: Mapped[date | None] = mapped_column(Date)

    responsible_sales: Mapped[str | None] = mapped_column(Text, index=True)
    group_name: Mapped[str | None] = mapped_column(Text, index=True)
    merchandiser: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
