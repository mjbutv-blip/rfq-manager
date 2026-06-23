"""
产品工艺分析（报价资料分析 Step 6）。

统计的最小单位：
  - 款式相关统计（缺工艺说明/缺标签/优先补录等）：inquiry_items；
  - 工艺标签统计（应用次数、排名等）：inquiry_item_processes —— 一条记录
    代表"一个款式使用了一项标准化工艺标签"，同一款式下相同标签不会重复
    （创建时已做大小写不敏感去重，见 routers/inquiry_items.py）。

口径说明：
  - "缺原始工艺说明" / "有原始工艺说明但缺标准化标签" / "有标准化标签"
    三种状态互斥，必须分开统计，不能混为一谈——即使 process_description
    有内容，只要 inquiry_item_processes 没有记录，仍然是"缺标准化标签"。
  - is_special 直接读取 inquiry_item_processes.is_special，不根据标签文字
    做任何猜测；同一标签在不同款式上的 is_special 取值理论上可能不一致
    （数据录入差异），process_rankings 按"出现次数更多的取值"作为展示用的
    代表值，不做强行统一。
  - 标签归并 key 用 tag.strip().lower()，因为创建时的去重也是大小写不敏感
    的，但只在"同一款式内"生效，不同款式之间可能存在大小写不一致的同义
    标签；展示用标签取该归并组里出现次数最多的原始大小写写法。
  - average_final_quote / average_factory_price / average_gross_profit_rate
    只是"关联平均值"，数据来自该工艺标签所在款式的询单整体报价信息（报价
    字段在 inquiries 表，不在 inquiry_items 表），缺失值不参与平均，全部
    缺失时返回 None，不能假装是 0。这些数值不构成因果结论。

已知限制：sample_records / production_records 只有 inquiry_id 外键，没有
inquiry_item_id；一个询单可能有多个款式，其中只有部分是特殊工艺。因此
"特殊工艺且打样/生产延期"这两条风险信号只能做到"询单级"近似——如果某询单
里有特殊工艺款式，且该询单本身存在逾期打样/生产记录，就把该询单下的特殊
工艺款式都计入信号，而不是精确判断"延期的就是这个特殊工艺款式本身"。这是
当前数据结构下能做到的最可靠近似，不做更进一步的猜测性关联。
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem
from app.models.production_record import ProductionRecord
from app.models.sample_record import SampleRecord

# 与 warning_service 中"逾期打样"的口径保持一致，不另造一套判断标准。
SAMPLE_NON_OVERDUE_STATUSES = {"approved", "rejected", "cancelled", "sent", "received"}
# 生产延期：直接读取已有的显式字段（production_status / delay_risk_level），不做推断。
PRODUCTION_DELAYED_STATUSES = {"delayed"}
PRODUCTION_DELAY_RISK_LEVELS = {"medium", "high"}

ORDER_PRIORITY_STATUSES = {"下单", "已下单", "确认转单"}
QUOTE_PRIORITY_STATUSES = {"已报价"}


def _filled(v: Any) -> bool:
    return bool(v is not None and str(v).strip())


def has_description(item: InquiryItem) -> bool:
    return _filled(item.process_description)


def has_tags(item: InquiryItem) -> bool:
    return len(item.processes) > 0


def has_priority_status(inquiry: Inquiry | None) -> bool:
    if not inquiry:
        return False
    return (inquiry.order_status in ORDER_PRIORITY_STATUSES) or (inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def missing_process_fields(item: InquiryItem) -> list[str]:
    missing: list[str] = []
    if not has_description(item):
        missing.append("原始工艺说明")
    if not has_tags(item):
        missing.append("标准化工艺标签")
    return missing


def is_priority_candidate(item: InquiryItem) -> bool:
    """缺原始说明，或者有说明但没有标签——这是优先补录清单的入围条件。"""
    return (not has_description(item)) or (has_description(item) and not has_tags(item))


def priority_tier(item: InquiryItem, inquiry: Inquiry | None) -> int:
    """
    优先级分层（数值越大越优先），对应需求文档第九节 1-3 条规则：
      3：已下单/已报价 且 没有原始工艺说明；
      2：已下单/已报价 且 有说明但没有标签；
      1：特殊工艺（任一标签 is_special）且没有原始工艺说明，但不满足上面两条
         （即不是已下单/已报价）；
      0：其余满足入围条件的情形（如：有说明但缺标签，且非已下单/已报价）。
    """
    priority_status = has_priority_status(inquiry)
    no_desc = not has_description(item)
    no_tags = not has_tags(item)
    is_special_item = any(p.is_special for p in item.processes)

    if priority_status and no_desc:
        return 3
    if priority_status and has_description(item) and no_tags:
        return 2
    if is_special_item and no_desc:
        return 1
    return 0


def risk_hint(item: InquiryItem) -> str:
    is_special_item = any(p.is_special for p in item.processes)
    no_desc = not has_description(item)
    no_tags = not has_tags(item)
    if is_special_item and no_desc:
        return "特殊工艺缺少原始说明，建议补充具体工艺要求"
    if not no_desc and no_tags:
        return "已有工艺描述，但尚未完成工艺标签标准化"
    if no_desc:
        return "缺少原始工艺说明"
    return ""


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    """
    (tier, 缺失字段数, 询单日期, 更新时间) 全部"越大越靠前"，配合
    sorted(..., reverse=True) 使用。
    """
    return (
        entry["_tier"],
        entry["missing_field_count"],
        entry["inquiry_date"] or date.min,
        entry["_updated_at"] or datetime.min,
    )


def normalize_tag_key(tag: str) -> str:
    return tag.strip().lower()


def mode_value(counter: Counter) -> Any:
    return counter.most_common(1)[0][0] if counter else None


def avg_or_none(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 4) if vals else None


async def fetch_overdue_sample_inquiry_ids(db, inquiry_ids: set) -> set:
    """复用 warning_service 的逾期打样口径：factory_due_date < today 且状态未到终态。"""
    if not inquiry_ids:
        return set()
    from sqlalchemy import select

    today = date.today()
    rows = (await db.execute(
        select(SampleRecord.inquiry_id).where(
            SampleRecord.inquiry_id.in_(inquiry_ids),
            SampleRecord.factory_due_date.is_not(None),
            SampleRecord.factory_due_date < today,
            SampleRecord.sample_status.not_in(SAMPLE_NON_OVERDUE_STATUSES),
        )
    )).scalars().all()
    return {r for r in rows if r is not None}


async def fetch_delayed_production_inquiry_ids(db, inquiry_ids: set) -> set:
    """直接读取已有的显式延期字段，不做推断。"""
    if not inquiry_ids:
        return set()
    from sqlalchemy import or_, select

    rows = (await db.execute(
        select(ProductionRecord.inquiry_id).where(
            ProductionRecord.inquiry_id.in_(inquiry_ids),
            or_(
                ProductionRecord.production_status.in_(PRODUCTION_DELAYED_STATUSES),
                ProductionRecord.delay_risk_level.in_(PRODUCTION_DELAY_RISK_LEVELS),
            ),
        )
    )).scalars().all()
    return {r for r in rows if r is not None}
