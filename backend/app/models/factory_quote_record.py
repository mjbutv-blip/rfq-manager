import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FactoryQuoteRecord(Base):
    __tablename__ = "factory_quote_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # 没有工厂档案时允许只存 factory_name（手绘需求："允许只保存 factory_name"）。
    factory_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    factory_name: Mapped[str | None] = mapped_column(Text)

    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    inquiry_no: Mapped[str | None] = mapped_column(Text, index=True)

    # ── 按轮次填报的工厂报价卡片专用字段（不影响导入快照行，那些行 quote_round 始终为空）──
    quote_round: Mapped[int | None] = mapped_column(Integer, index=True)
    currency: Mapped[str | None] = mapped_column(Text)
    price_unit: Mapped[str | None] = mapped_column(Text)
    quoted_by: Mapped[str | None] = mapped_column(Text)
    quoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
