import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, SmallInteger, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Inquiry(Base):
    __tablename__ = "inquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    # 客户信息（平铺，不依赖 FK，导入更简单）
    customer_code: Mapped[str | None] = mapped_column(Text, index=True)
    customer_order_no: Mapped[str | None] = mapped_column(Text)
    customer_name: Mapped[str | None] = mapped_column(Text)
    customer_short_name: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    customer_category: Mapped[str | None] = mapped_column(Text)

    # 归属信息
    group_name: Mapped[str | None] = mapped_column(Text, index=True)
    responsible_sales: Mapped[str | None] = mapped_column(Text, index=True)
    assisting_sales: Mapped[str | None] = mapped_column(Text)

    # 产品信息
    product_category: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(Text)
    series_name: Mapped[str | None] = mapped_column(Text, index=True)
    season: Mapped[str | None] = mapped_column(Text, index=True)
    quantity: Mapped[int | None] = mapped_column(Integer)
    inquiry_date: Mapped[date | None] = mapped_column(Date)

    # 报价与订单状态
    quote_status: Mapped[str | None] = mapped_column(Text)
    order_status: Mapped[str | None] = mapped_column(Text, index=True)

    # 价格信息
    final_quote: Mapped[float | None] = mapped_column(Numeric(12, 4))
    factory_price: Mapped[float | None] = mapped_column(Numeric(12, 4))
    gross_profit_rate: Mapped[float | None] = mapped_column(Numeric(6, 2))
    order_unit_price: Mapped[float | None] = mapped_column(Numeric(12, 4))
    order_quantity: Mapped[int | None] = mapped_column(Integer)
    trade_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    order_date: Mapped[date | None] = mapped_column(Date)

    # 统计辅助（从 inquiry_date 自动派生）
    inquiry_year: Mapped[int | None] = mapped_column(SmallInteger, index=True)
    inquiry_month: Mapped[str | None] = mapped_column(Text)  # "Jan" / "Feb" …

    remark: Mapped[str | None] = mapped_column(Text)
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)

    # "适用工厂"——单个订单来龙去脉表用，业务人员手动指定，不参与任何报价比较的自动改写
    applicable_factory_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items: Mapped[list["InquiryItem"]] = relationship(  # noqa: F821
        "InquiryItem", back_populates="inquiry",
        cascade="all, delete-orphan", lazy="noload",
    )
