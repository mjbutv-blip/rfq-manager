import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SampleRecord(Base):
    __tablename__ = "sample_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

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

    # color_sample | handfeel_sample | first_sample | revised_sample | pp_sample | confirmation_sample | other
    sample_type: Mapped[str | None] = mapped_column(Text)
    sample_quantity: Mapped[int | None] = mapped_column(Integer)

    # pending | assigned | making | sent | received | feedback_received | revision_needed | approved | rejected | cancelled
    sample_status: Mapped[str] = mapped_column(Text, nullable=False, default="pending", index=True)

    assigned_to_factory_at: Mapped[date | None] = mapped_column(Date)
    factory_due_date: Mapped[date | None] = mapped_column(Date, index=True)
    sample_sent_at: Mapped[date | None] = mapped_column(Date)
    courier_company: Mapped[str | None] = mapped_column(Text)
    tracking_no: Mapped[str | None] = mapped_column(Text)
    customer_received_at: Mapped[date | None] = mapped_column(Date)

    customer_feedback: Mapped[str | None] = mapped_column(Text)
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # pending | approved | rejected | cancelled | converted_to_order
    final_result: Mapped[str] = mapped_column(Text, nullable=False, default="pending")

    sample_fee: Mapped[float | None] = mapped_column(Numeric(10, 2))
    # customer | company | factory | unknown
    fee_paid_by: Mapped[str | None] = mapped_column(Text)
    # unpaid | paid | waived | pending
    fee_payment_status: Mapped[str | None] = mapped_column(Text)

    responsible_sales: Mapped[str | None] = mapped_column(Text, index=True)
    group_name: Mapped[str | None] = mapped_column(Text, index=True)
    remark: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
