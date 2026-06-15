import uuid
from datetime import datetime

from pydantic import BaseModel


class InquiryItemBase(BaseModel):
    """inquiry_items 表公共字段"""

    inquiry_id: uuid.UUID
    inquiry_no: str | None = None
    product_name: str | None = None
    product_category: str | None = None
    series_name: str | None = None
    fabric_quality: str | None = None       # 面料品质
    color_print: str | None = None          # 颜色/印花
    size_range: str | None = None           # 尺码范围
    quantity: int | None = None
    quote_status: str | None = None
    order_status: str | None = None
    remark: str | None = None


class InquiryItemCreate(InquiryItemBase):
    """创建明细行时传入"""
    pass


class InquiryItemRead(InquiryItemBase):
    """查询明细行时返回"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


InquiryItemOut = InquiryItemRead
