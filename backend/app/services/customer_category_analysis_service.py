"""
客户 × 品类 × 款式分析（报价资料分析 Step 5）。

统计的最小单位是 inquiry_items（款式明细），不是 inquiries——同一询单可能
包含多个品类/款式，按询单统计会把它们错误地合并成一条记录。

口径说明（与需求文档第二/三节一致）：
  - 款式识别：优先用 style_no；style_no 为空时退化为 product_name + series_name；
    如果连 product_name 都没有，则该款式记为"未知款式"。未知款式不会被从
    任何分母里剔除，但每条未知款式各自占用一个独立的统计位——因为我们没有
    可靠依据判断两条缺失关键信息的明细是否真的是"同一个款式"，宁可保守地
    把它们当作彼此不同，也不要靠猜测把它们合并计数。
  - 客户识别：优先用 customer_code；customer_code 为空时退化为
    customer_short_name；两者都为空归入"未知客户"。
  - 品类识别：优先用 inquiry_items.product_category；为空时退化使用
    inquiries.product_category；仍为空归入"未填写品类"。
  - 不做任何静默排除、不做历史数据修改、不自动合并潜在重复款。
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem

UNKNOWN_CUSTOMER_LABEL = "未知客户"
UNKNOWN_CATEGORY_LABEL = "未填写品类"
UNKNOWN_STYLE_LABEL = "未知款式"


def _filled(v: Any) -> bool:
    return bool(v is not None and str(v).strip())


def style_identity(item: InquiryItem) -> tuple[str, bool, str]:
    """
    返回 (识别用 key, 是否可靠识别, 展示用标签)。

    key 仅用于"同客户内是否为同一款式"的分组/去重判断；未知款式的 key 用
    item.id 保证彼此不冲突（见模块顶部说明，不靠猜测合并）。
    """
    if _filled(item.style_no):
        sn = item.style_no.strip()
        return (f"sn:{sn}", True, sn)
    if _filled(item.product_name):
        name = item.product_name.strip()
        series = item.series_name.strip() if _filled(item.series_name) else ""
        return (f"ns:{name}|{series}", True, name)
    return (f"unknown:{item.id}", False, UNKNOWN_STYLE_LABEL)


def customer_identity(inquiry: Inquiry | None) -> tuple[str, str | None, str]:
    """返回 (分组 key, customer_code, 展示用 customer_short_name)。"""
    code = inquiry.customer_code if inquiry else None
    short_name = inquiry.customer_short_name if inquiry else None
    if _filled(code):
        return (f"code:{code.strip()}", code.strip(), short_name or code.strip())
    if _filled(short_name):
        return (f"name:{short_name.strip()}", None, short_name.strip())
    return ("unknown", None, UNKNOWN_CUSTOMER_LABEL)


def effective_category(item: InquiryItem, inquiry: Inquiry | None) -> str:
    """item 级 product_category 优先；为空退化用 inquiry 级；仍为空归入未填写。"""
    if _filled(item.product_category):
        return item.product_category.strip()
    if inquiry and _filled(inquiry.product_category):
        return inquiry.product_category.strip()
    return UNKNOWN_CATEGORY_LABEL


def missing_analysis_fields(
    customer_key: str, category: str, style_known: bool,
) -> list[str]:
    """返回会影响本分析准确性的缺失字段中文名列表。"""
    missing: list[str] = []
    if customer_key == "unknown":
        missing.append("客户编码/客户简称")
    if category == UNKNOWN_CATEGORY_LABEL:
        missing.append("产品品类")
    if not style_known:
        missing.append("款号或品名+系列")
    return missing


def preference_type(total_style_count: int, top1_share: float, category_count: int) -> str:
    """
    preference_type 规则（按顺序判断）：
      样本不足：总款式数 < 3；
      品类集中：第一品类占比 >= 60%；
      品类均衡：其余情况（含需求文档列出的"占比 < 60% 且品类数 >= 3"，
                以及未显式列出但同样不算集中的中间情形，如占比 < 60% 且
                品类数为 2——这种情形本身就不满足"集中"，归入"均衡"更
                符合"没有明显单一核心品类"的实际含义，不强行造一个新标签）。
    """
    if total_style_count < 3:
        return "样本不足"
    if top1_share >= 0.6:
        return "品类集中"
    return "品类均衡"


def preference_notes(
    customer_label: str, primary_categories: list[dict[str, Any]], pref_type: str,
) -> list[str]:
    """按规则生成中文说明句子，不依赖 AI。"""
    if not primary_categories:
        return []
    notes: list[str] = []
    top = primary_categories[0]
    if pref_type == "品类集中":
        notes.append(f"{top['product_category']}占比 {round(top['share'] * 100, 1)}%，为核心报价品类")
    elif pref_type == "品类均衡":
        names = "、".join(c["product_category"] for c in primary_categories[:3])
        notes.append(f"报价品类较分散，主要集中在{names}")
    else:
        notes.append("款式样本数较少，暂无法判断品类偏好")
    if len(primary_categories) >= 2 and pref_type != "样本不足":
        cat_names = "和".join(c["product_category"] for c in primary_categories[:2])
        notes.append(f"近期开款集中在{cat_names}")
    return notes


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    """缺失资料优先级排序：缺失字段越多越靠前，询单越新越靠前，更新时间倒序。"""
    return (
        entry["missing_field_count"],
        entry["inquiry_date"] or date.min,
        entry["_updated_at"] or datetime.min,
    )


def top_n_categories(category_counter: Counter, n: int = 3) -> list[tuple[str, int]]:
    return category_counter.most_common(n)
