"""
报价数量 / 订单规模分析（报价资料分析 Step 8）。

统计的最小单位是 inquiry_items（款式明细），不是 inquiries——数量字段统一
使用 inquiry_items.quantity（款式级），不用 inquiries.quantity 代替。

口径说明：
  - quantity 为 NULL：归入"未填写"区间，不计入有数量款式数，也不参与
    平均值/中位数/最大最小值的计算。
  - quantity = 0：单独归入"0"区间，算"有数量"（不是缺失），同样参与
    总和/平均值等统计——不会把 0 当成录入错误自动剔除。
  - quantity 必须是非负数（创建/编辑款式时已有校验，这里不重复校验，只
    是统计口径上明确不支持负数）。
  - 所有均值/中位数/最大最小值缺失时返回 None，不用 0 伪装。
  - 数量总和只是"当前筛选范围内款式数量的合计"，不代表实际最终订单数量
    或公司总销量——前端必须展示这一说明。

风险提示（第十一节）：
  1. 已报价或已下单但缺数量；
  2. 数量为 0（仅提示确认，不自动判错）；
  3. 数量高于当前筛选范围 P95（仅当非空样本数 >= 20 时才计算，避免小样本
     的极差极值);
  4. 0 < 数量 < 100 的小批量提示（不假设系统已有 MOQ 数据）。
  全部都是"数据关联提示"，不是自动判定的异常或风险结论。
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem

ORDER_PRIORITY_STATUSES = {"下单", "已下单", "确认转单"}
QUOTE_PRIORITY_STATUSES = {"已报价"}

# 区间顺序，决定 quantity_distribution 的展示顺序
BUCKET_ORDER = [
    "未填写", "0", "1–99", "100–499", "500–999",
    "1,000–2,999", "3,000–4,999", "5,000–9,999", "10,000+",
]
SMALL_BATCH_BUCKETS = {"1–99", "100–499"}
LARGE_BATCH_BUCKETS = {"5,000–9,999", "10,000+"}

P95_MIN_SAMPLE = 20


def quantity_bucket(qty: int | None) -> str:
    if qty is None:
        return "未填写"
    if qty == 0:
        return "0"
    if qty < 100:
        return "1–99"
    if qty < 500:
        return "100–499"
    if qty < 1000:
        return "500–999"
    if qty < 3000:
        return "1,000–2,999"
    if qty < 5000:
        return "3,000–4,999"
    if qty < 10000:
        return "5,000–9,999"
    return "10,000+"


def is_small_batch(bucket: str) -> bool:
    return bucket in SMALL_BATCH_BUCKETS


def is_large_batch(bucket: str) -> bool:
    return bucket in LARGE_BATCH_BUCKETS


def has_priority_status(inquiry: Inquiry | None) -> bool:
    if not inquiry:
        return False
    return (inquiry.order_status in ORDER_PRIORITY_STATUSES) or (inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def has_order_priority(inquiry: Inquiry | None) -> bool:
    return bool(inquiry and inquiry.order_status in ORDER_PRIORITY_STATUSES)


def has_quote_priority(inquiry: Inquiry | None) -> bool:
    return bool(inquiry and inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def avg_or_none(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 4) if vals else None


def median_or_none(values: list[float]) -> float | None:
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if n == 0:
        return None
    mid = n // 2
    if n % 2 == 1:
        return float(vals[mid])
    return round((vals[mid - 1] + vals[mid]) / 2, 4)


def percentile_or_none(values: list[float], p: float) -> float | None:
    """最近邻法百分位数（不插值），样本不足时由调用方决定是否使用。"""
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if n == 0:
        return None
    idx = min(n - 1, max(0, int(round(p / 100 * (n - 1)))))
    return float(vals[idx])


def mode_value(counter: Counter) -> Any:
    return counter.most_common(1)[0][0] if counter else None


def is_priority_candidate(item: InquiryItem) -> bool:
    """quantity 为空，或者 quantity = 0——优先补录清单入围条件。"""
    return item.quantity is None or item.quantity == 0


def priority_tier(item: InquiryItem, inquiry: Inquiry | None) -> int:
    """
    优先级分层（数值越大越优先），对应需求文档第十二节 1-3 条规则：
      3：已下单 且 quantity 为空；
      2：已报价（非已下单）且 quantity 为空；
      1：quantity = 0；
      0：quantity 为空，但既非已下单也非已报价。
    """
    if item.quantity is None:
        if has_order_priority(inquiry):
            return 3
        if has_quote_priority(inquiry):
            return 2
        return 0
    if item.quantity == 0:
        return 1
    return 0


def risk_hint(item: InquiryItem, inquiry: Inquiry | None) -> str:
    if item.quantity is None:
        if has_priority_status(inquiry):
            return "已报价或已下单款式缺少数量资料，建议补录"
        return "缺少数量资料"
    if item.quantity == 0:
        return "款式数量为 0，请确认是否为试样、占位数据或录入错误"
    return ""


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    return (
        entry["_tier"],
        entry["inquiry_date"] or date.min,
        entry["_updated_at"] or datetime.min,
    )
