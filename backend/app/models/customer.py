import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    customer_name: Mapped[str | None] = mapped_column(Text)
    customer_short_name: Mapped[str | None] = mapped_column(Text, index=True)
    country: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    customer_category: Mapped[str | None] = mapped_column(Text)
    group_name: Mapped[str | None] = mapped_column(Text)
    responsible_sales: Mapped[str | None] = mapped_column(Text)

    # 客户档案字段 (v7)
    customer_level: Mapped[str | None] = mapped_column(Text)      # high_value/potential/normal/inactive
    customer_tags: Mapped[list | None] = mapped_column(JSONB)      # list[str]
    payment_terms: Mapped[str | None] = mapped_column(Text)
    price_preference: Mapped[str | None] = mapped_column(Text)
    follow_up_note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
