import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FactoryQuoteRecord(Base):
    __tablename__ = "factory_quote_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False, index=True)
    factory_name: Mapped[str | None] = mapped_column(Text)

    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    inquiry_no: Mapped[str | None] = mapped_column(Text, index=True)

    product_category: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(Text)
    series_name: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int | None] = mapped_column(Integer)

    factory_price: Mapped[float | None] = mapped_column(Numeric(12, 4))
    quote_date: Mapped[date | None] = mapped_column(Date, index=True)
    quote_status: Mapped[str | None] = mapped_column(Text)
    order_status: Mapped[str | None] = mapped_column(Text)
    is_ordered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    trade_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))

    remark: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    factory: Mapped["Factory"] = relationship(  # noqa: F821
        "Factory", back_populates="quote_records", lazy="noload",
    )
