import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderRecord(Base):
    __tablename__ = "order_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_order_no: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(Text)
    order_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    order_unit_price_usd: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    order_total_amount_usd: Mapped[float | None] = mapped_column(Numeric(14, 2))
    order_date: Mapped[date | None] = mapped_column(Date, index=True)
    factory_name: Mapped[str | None] = mapped_column(Text)
    factory_unit_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))
    factory_total_price_cny: Mapped[float | None] = mapped_column(Numeric(14, 2))
    gross_profit_cny: Mapped[float | None] = mapped_column(Numeric(14, 2))
    gross_profit_pct: Mapped[float | None] = mapped_column(Numeric(6, 2))
    payment_terms: Mapped[str | None] = mapped_column(Text)
    estimated_delivery_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    entered_by: Mapped[str | None] = mapped_column(Text)
    entry_date: Mapped[date | None] = mapped_column(Date)
    reviewed_by: Mapped[str | None] = mapped_column(Text)
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    inquiry: Mapped["Inquiry"] = relationship(  # noqa: F821
        "Inquiry", back_populates="order_records", lazy="noload"
    )
    customer: Mapped["Customer"] = relationship("Customer", lazy="noload")  # noqa: F821
