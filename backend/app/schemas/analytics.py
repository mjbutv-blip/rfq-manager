from __future__ import annotations

from datetime import date
from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_inquiries: int
    total_quoted: int
    total_ordered: int
    conversion_rate: float
    total_trade_amount: float
    avg_gross_profit_rate: float | None


class SalesStat(BaseModel):
    responsible_sales: str
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_trade_amount: float
    avg_gross_profit_rate: float | None


class CustomerStat(BaseModel):
    customer_code: str | None
    customer_short_name: str | None
    inquiry_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_order_amount: float
    last_inquiry_date: date | None
    last_order_date: date | None
    top_product_category: str | None
    top_series: str | None


class GroupStat(BaseModel):
    group_name: str
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_gross_profit_rate: float | None


class ProductStat(BaseModel):
    product_category: str
    series_name: str
    inquiry_count: int
    ordered_count: int
    conversion_rate: float
    total_quantity: int
    total_trade_amount: float
    avg_final_quote: float | None
    avg_gross_profit_rate: float | None


class QuarterStat(BaseModel):
    year: int
    quarter: int
    quarter_label: str
    season_type: str          # SS or FW/AW
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    prev_quarter_trade: float | None
    trade_change_pct: float | None
