import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Factory(Base):
    __tablename__ = "factories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    factory_name: Mapped[str | None] = mapped_column(Text, index=True)
    factory_short_name: Mapped[str | None] = mapped_column(Text, index=True)

    country: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    contact_person: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)

    main_categories: Mapped[list | None] = mapped_column(JSONB)
    capability_tags: Mapped[list | None] = mapped_column(JSONB)
    certificate_tags: Mapped[list | None] = mapped_column(JSONB)

    # high / medium / low
    price_position: Mapped[str | None] = mapped_column(Text)
    moq: Mapped[int | None] = mapped_column(Integer)
    normal_lead_time_days: Mapped[int | None] = mapped_column(Integer)
    payment_terms: Mapped[str | None] = mapped_column(Text)

    # active / inactive / blacklisted / potential
    cooperation_status: Mapped[str | None] = mapped_column(Text, index=True)
    # low / medium / high
    risk_level: Mapped[str | None] = mapped_column(Text, index=True)
    risk_tags: Mapped[list | None] = mapped_column(JSONB)

    remark: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    quote_records: Mapped[list["FactoryQuoteRecord"]] = relationship(  # noqa: F821
        "FactoryQuoteRecord", back_populates="factory",
        cascade="all, delete-orphan", lazy="noload",
    )
