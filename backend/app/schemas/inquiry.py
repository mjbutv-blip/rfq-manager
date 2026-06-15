import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── InquiryBase / InquiryCreate / InquiryRead ─────────────────────────────────

class InquiryBase(BaseModel):
    """inquiries 表公共字段（用于 Create / Read 继承）"""

    inquiry_no: str
    customer_code: str | None = None
    customer_order_no: str | None = None
    customer_name: str | None = None
    customer_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    customer_category: str | None = None
    group_name: str | None = None
    responsible_sales: str | None = None
    assisting_sales: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    season: str | None = None
    quantity: int | None = None
    inquiry_date: date | None = None
    quote_status: str | None = None
    order_status: str | None = None
    # 金额字段用 Decimal 保证精度
    final_quote: Decimal | None = None
    factory_price: Decimal | None = None
    gross_profit_rate: Decimal | None = None
    order_unit_price: Decimal | None = None
    order_quantity: int | None = None
    trade_amount: Decimal | None = None
    order_date: date | None = None
    inquiry_year: int | None = None
    inquiry_month: str | None = None        # "Jan" / "Feb" … 由 inquiry_date 派生
    remark: str | None = None


class InquiryCreate(InquiryBase):
    """写入询单时使用（Excel 导入解析结果 → 此 schema）"""
    pass


class InquiryRead(InquiryBase):
    """查询询单时返回（包含 id 和时间戳）"""
    id: uuid.UUID
    import_batch_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── 以下保留现有路由/服务层使用的名称（向后兼容）────────────────────────────────

class InquiryListItem(BaseModel):
    """全公司询单总表行数据（前端列表展示，float 方便 JSON 序列化）"""

    id: uuid.UUID
    inquiry_no: str
    customer_code: str | None = None
    customer_order_no: str | None = None
    customer_name: str | None = None
    customer_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    customer_category: str | None = None
    group_name: str | None = None
    responsible_sales: str | None = None
    assisting_sales: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    season: str | None = None
    quantity: int | None = None
    inquiry_date: date | None = None
    quote_status: str | None = None
    order_status: str | None = None
    final_quote: float | None = None
    factory_price: float | None = None
    gross_profit_rate: float | None = None
    order_unit_price: float | None = None
    order_quantity: int | None = None
    trade_amount: float | None = None
    order_date: date | None = None
    inquiry_year: int | None = None
    inquiry_month: str | None = None
    remark: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InquiryUpdate(BaseModel):
    """手动编辑询单时允许修改的字段（inquiry_no 和系统字段不可改）"""

    # 客户信息
    customer_code: str | None = None
    customer_order_no: str | None = None
    customer_name: str | None = None
    customer_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    customer_category: str | None = None

    # 归属
    group_name: str | None = None
    responsible_sales: str | None = None
    assisting_sales: str | None = None

    # 产品
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    season: str | None = None
    quantity: int | None = None
    inquiry_date: date | None = None

    # 报价与订单
    quote_status: str | None = None
    order_status: str | None = None
    final_quote: float | None = None
    factory_price: float | None = None
    gross_profit_rate: float | None = None
    order_unit_price: float | None = None
    order_quantity: int | None = None
    trade_amount: float | None = None
    order_date: date | None = None
    remark: str | None = None


class InquiryFilter(BaseModel):
    """全公司询单总表查询参数"""

    inquiry_no: str | None = None           # 模糊搜索
    customer_code: str | None = None
    customer_short_name: str | None = None  # 模糊搜索
    group_name: str | None = None
    responsible_sales: str | None = None
    assisting_sales: str | None = None
    product_category: str | None = None
    product_name: str | None = None         # 模糊搜索
    series_name: str | None = None
    quote_status: str | None = None
    order_status: str | None = None
    season: str | None = None
    year: int | None = None
    month: str | None = None                # "Jan" / "Feb" …
    start_date: date | None = None          # inquiry_date 起始（含）
    end_date: date | None = None            # inquiry_date 截止（含）
    sort_by: str | None = Field(default=None,
        description="inquiry_date | trade_amount | created_at | inquiry_no")
    sort_order: str | None = Field(default="desc", description="asc | desc")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
