import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ── InquiryItemProcess（款式工艺标签）──────────────────────────────────────────

class InquiryItemProcessBase(BaseModel):
    process_tag: str
    process_type: str | None = None     # 例如 "regular" / "special"
    is_special: bool = False


class InquiryItemProcessCreate(InquiryItemProcessBase):
    """新增一条款式工艺标签时传入"""
    pass


class InquiryItemProcessRead(InquiryItemProcessBase):
    id: uuid.UUID
    inquiry_item_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── InquiryItemSize（款式标准化尺码）────────────────────────────────────────────

class InquiryItemSizeBase(BaseModel):
    size_code: str
    is_special_size: bool = False


class InquiryItemSizeCreate(InquiryItemSizeBase):
    """新增一条款式尺码时传入"""
    pass


class InquiryItemSizeRead(InquiryItemSizeBase):
    id: uuid.UUID
    inquiry_item_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── InquiryItem（询单款式明细）──────────────────────────────────────────────────

class InquiryItemBase(BaseModel):
    """inquiry_items 表公共字段"""

    inquiry_id: uuid.UUID
    inquiry_no: str | None = None
    product_name: str | None = None
    product_category: str | None = None
    series_name: str | None = None
    fabric_quality: str | None = None       # 面料品质
    color_print: str | None = None          # 颜色/印花
    size_range: str | None = None           # 尺码范围（原始文本）
    quantity: int | None = None
    quote_status: str | None = None
    order_status: str | None = None
    remark: str | None = None

    # 报价资料分析相关字段（详见字段审计报告）
    style_no: str | None = None             # 款号
    quote_prepared_by: str | None = None    # 报价单填报人
    process_description: str | None = None  # 原始工艺描述（常规+特殊工艺拼接）
    extra_data: dict[str, Any] | None = None  # 暂无独立列的字段（如数量单位、工艺原文来源）


class InquiryItemCreate(InquiryItemBase):
    """创建明细行时传入"""
    pass


class InquiryItemCreateRequest(BaseModel):
    """
    POST /inquiries/{inquiry_id}/items 请求体。
    inquiry_id 来自 URL 路径，不允许客户端指定（防止把明细挂到别的询单上）。
    """

    product_name: str                       # 必填
    style_no: str | None = None
    product_category: str | None = None
    series_name: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    size_range: str | None = None
    quote_prepared_by: str | None = None
    process_description: str | None = None
    remark: str | None = None

    @field_validator("product_name")
    @classmethod
    def _product_name_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("品名不能为空")
        return v.strip()


class InquiryItemUpdate(BaseModel):
    """编辑明细行时传入（全部可选，只更新传入的字段；product_name 若传入不可为空）"""

    product_name: str | None = None
    product_category: str | None = None
    series_name: str | None = None
    fabric_quality: str | None = None
    color_print: str | None = None
    size_range: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    quote_status: str | None = None
    order_status: str | None = None
    remark: str | None = None
    style_no: str | None = None
    quote_prepared_by: str | None = None
    process_description: str | None = None
    extra_data: dict[str, Any] | None = None


class InquiryItemRead(InquiryItemBase):
    """查询明细行时返回，含工艺标签和尺码明细"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    processes: list[InquiryItemProcessRead] = []
    sizes: list[InquiryItemSizeRead] = []

    model_config = {"from_attributes": True}


InquiryItemOut = InquiryItemRead
