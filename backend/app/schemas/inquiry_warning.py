import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class InquiryWarningOut(BaseModel):
    id: uuid.UUID
    inquiry_id: uuid.UUID
    inquiry_no: str
    warning_type: str
    warning_level: str
    warning_message: str
    field_name: str | None
    current_value: str | None
    suggested_action: str | None
    is_resolved: bool
    resolved_at: datetime | None
    resolved_by: str | None
    resolved_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InquiryWarningRich(InquiryWarningOut):
    """预警列表行：附带询单上下文字段（来自 JOIN inquiries）。"""
    customer_short_name: str | None = None
    group_name:          str | None = None
    responsible_sales:   str | None = None
    product_name:        str | None = None
    quote_status:        str | None = None
    order_status:        str | None = None

    @classmethod
    def from_join(cls, warning: Any, inquiry: Any) -> "InquiryWarningRich":
        data = {
            c.name: getattr(warning, c.name)
            for c in warning.__table__.columns
        }
        data["customer_short_name"] = inquiry.customer_short_name
        data["group_name"]          = inquiry.group_name
        data["responsible_sales"]   = inquiry.responsible_sales
        data["product_name"]        = inquiry.product_name
        data["quote_status"]        = inquiry.quote_status
        data["order_status"]        = inquiry.order_status
        return cls(**data)


class WarningSummary(BaseModel):
    total_unresolved: int
    high: int
    medium: int
    low: int
    missing_required_field: int
    follow_up_timeout: int
    price_abnormal: int
    status_conflict: int
    sample_overdue: int = 0
    production_delay: int = 0
