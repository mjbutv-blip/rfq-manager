"""
报价单填报人 / 人员维度分析（报价资料分析 Step 9）。

统计的最小单位是 inquiry_items（款式明细），不是 inquiries。

核心业务口径（必须区分，不能混用）：
  - responsible_sales：负责客户/负责该询单的业务员；
  - quote_prepared_by：实际填写、整理或录入这条款式报价资料的人。
  两者可能相同，也可能不同——本模块不会用 responsible_sales 自动推断或
  填充 quote_prepared_by，缺失就是缺失，照实统计。

填报人识别规则：
  - 非空、去首尾空格后作为填报人名称（normalize_preparer 做归并 key，
    展示用标签取原始大小写/写法中出现次数最多的那个）；
  - 空值/全空格统一归入"未填写填报人"，且不会被从任何分母或排名列表中
    剔除——"填报人数"（unique_preparer_count）这一项统计指标例外，它只
    统计"实际填了名字的人数"，不把"未填写填报人"当成一个人计入。

data_completeness_rate 复用报价资料数据完整度（Step 4）的"完整"判定口径
（classify_item == "complete"），不是这里另造一套标准。

本模块的所有统计只是"工作分布与资料质量情况"的客观展示，不是绩效评价、
不打分、不排名打绩效、不做薪资/奖金计算，也不做 AI 人员表现总结。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem

ORDER_PRIORITY_STATUSES = {"下单", "已下单", "确认转单"}
QUOTE_PRIORITY_STATUSES = {"已报价"}

UNFILLED_PREPARER_LABEL = "未填写填报人"
LOW_COMPLETENESS_MIN_STYLE_COUNT = 5
LOW_COMPLETENESS_THRESHOLD = 0.5


def _filled(v: Any) -> bool:
    return bool(v is not None and str(v).strip())


def normalize_preparer(raw: str | None) -> str:
    """归并 key：非空去首尾空格小写化；空值统一归入未填写填报人。"""
    if _filled(raw):
        return raw.strip().lower()
    return "unfilled"


def preparer_label(raw: str | None) -> str:
    if _filled(raw):
        return raw.strip()
    return UNFILLED_PREPARER_LABEL


def has_preparer(item: InquiryItem) -> bool:
    return _filled(item.quote_prepared_by)


def has_priority_status(inquiry: Inquiry | None) -> bool:
    if not inquiry:
        return False
    return (inquiry.order_status in ORDER_PRIORITY_STATUSES) or (inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def has_order_priority(inquiry: Inquiry | None) -> bool:
    return bool(inquiry and inquiry.order_status in ORDER_PRIORITY_STATUSES)


def has_quote_priority(inquiry: Inquiry | None) -> bool:
    return bool(inquiry and inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def differs_from_responsible_sales(item: InquiryItem, inquiry: Inquiry | None) -> bool:
    """填报人与负责业务员是否不同——双方都必须有值才能判断，缺一方不算"不同"。"""
    if not has_preparer(item):
        return False
    resp = inquiry.responsible_sales if inquiry else None
    if not _filled(resp):
        return False
    return normalize_preparer(item.quote_prepared_by) != normalize_preparer(resp)


def is_priority_candidate(item: InquiryItem) -> bool:
    return not has_preparer(item)


def priority_tier(item: InquiryItem, inquiry: Inquiry | None) -> int:
    """
    优先级分层（数值越大越优先），对应需求文档第十一节 1-2 条规则：
      2：已下单 且 quote_prepared_by 为空；
      1：已报价（非已下单）且 quote_prepared_by 为空；
      0：quote_prepared_by 为空，但既非已下单也非已报价。
    """
    if has_order_priority(inquiry):
        return 2
    if has_quote_priority(inquiry):
        return 1
    return 0


def risk_hint(item: InquiryItem, inquiry: Inquiry | None) -> str:
    if has_priority_status(inquiry):
        return "已报价或已下单款式缺少报价单填报人，建议补录"
    return "缺少报价单填报人"


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    return (
        entry["_tier"],
        entry["inquiry_date"] or date.min,
        entry["_updated_at"] or datetime.min,
    )


def mode_value(counter) -> Any:
    return counter.most_common(1)[0][0] if counter else None
