import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuoteItem(Base):
    __tablename__ = "quote_items"
    __table_args__ = (
        UniqueConstraint("inquiry_id", "quote_round", name="uq_quote_items_inquiry_round"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quote_round: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)

    # 基本参数
    order_quantity: Mapped[int | None] = mapped_column(Integer)
    calc_quantity: Mapped[int | None] = mapped_column(Integer)
    port_misc_fee_cny: Mapped[float | None] = mapped_column(Numeric(10, 4))
    exchange_rate: Mapped[float | None] = mapped_column(Numeric(8, 4))

    # 工厂报价（最多3家）
    factory1_name: Mapped[str | None] = mapped_column(Text)
    factory1_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))
    factory2_name: Mapped[str | None] = mapped_column(Text)
    factory2_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))
    factory3_name: Mapped[str | None] = mapped_column(Text)
    factory3_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))

    # 价格分析
    lowest_factory: Mapped[str | None] = mapped_column(Text)
    lowest_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))
    second_lowest_factory: Mapped[str | None] = mapped_column(Text)
    second_lowest_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))

    # 报价决策
    net_profit_pct: Mapped[float | None] = mapped_column(Numeric(6, 2))
    commission_pct: Mapped[float | None] = mapped_column(Numeric(6, 2))
    selected_factory: Mapped[str | None] = mapped_column(Text)
    selected_factory_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))

    # 对客报价
    final_quote_usd: Mapped[float | None] = mapped_column(Numeric(12, 4))
    customer_target_price_usd: Mapped[float | None] = mapped_column(Numeric(12, 4))
    quote_vs_target_ratio: Mapped[float | None] = mapped_column(Numeric(6, 4))
    target_gap_cny: Mapped[float | None] = mapped_column(Numeric(10, 4))
    reverse_target_price_cny: Mapped[float | None] = mapped_column(Numeric(12, 4))
    gross_profit_cny: Mapped[float | None] = mapped_column(Numeric(14, 2))
    gross_profit_pct: Mapped[float | None] = mapped_column(Numeric(6, 2))

    # 结果
    order_status: Mapped[str | None] = mapped_column(Text, index=True)
    current_exchange_rate: Mapped[float | None] = mapped_column(Numeric(8, 4))
    trade_amount_usd: Mapped[float | None] = mapped_column(Numeric(14, 2))
    quote_date: Mapped[date | None] = mapped_column(Date, index=True)
    quote_situation: Mapped[str | None] = mapped_column(Text)

    # 报价进度追踪
    material_received_date: Mapped[date | None] = mapped_column(Date)
    factory_arranged_date: Mapped[date | None] = mapped_column(Date)
    client_quoted_date: Mapped[date | None] = mapped_column(Date)
    archive_email_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    price_tracking_notes: Mapped[str | None] = mapped_column(Text)

    notes: Mapped[str | None] = mapped_column(Text)
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    inquiry: Mapped["Inquiry"] = relationship(  # noqa: F821
        "Inquiry", back_populates="quote_items", lazy="noload"
    )
