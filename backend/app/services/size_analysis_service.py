"""
尺码范围与尺码偏好分析（报价资料分析 Step 7）。

统计的最小单位：
  - 款式相关统计（缺尺码资料/尺码跨度/优先补录等）：inquiry_items；
  - 标准化尺码统计（应用次数、排名等）：inquiry_item_sizes —— 一条记录
    代表"一个款式包含一个标准化尺码"，同一款式下相同尺码不会重复（创建
    时已做大小写不敏感去重，见 routers/inquiry_items.py）。

口径说明：
  - "缺原始尺码范围" / "有原始范围但缺标准化尺码" / "有标准化尺码" 三种
    状态互斥，必须分开统计——即使 size_range 有内容，只要 inquiry_item_sizes
    没有记录，仍然是"缺标准化尺码"，不会去自动解析 size_range 生成标签。
  - is_special_size 直接读取 inquiry_item_sizes.is_special_size，不根据
    "3XL"/"XXS"/杯型等尺码文字做任何猜测。
  - 尺码跨度（size_span_count）就是某款式关联的标准化尺码记录数量，不做任何
    "尺码距离"换算，也不会把不同体系的尺码（S/M/L、75B/80C、36/38/40）放在
    一起比较大小——它们只参与"有几个标准化尺码"这一计数。
  - average_size_span_count 等参考性平均值，缺失数据不参与平均，全部缺失
    时返回 None。

已知限制：与产品工艺分析（Step 6）相同——sample_records / production_records
只有 inquiry_id 外键，没有 inquiry_item_id；因此"特殊尺码 + 打样/生产延期"
这两条风险信号只能做到"询单级"近似：如果某询单里有特殊尺码款式，且该询单
本身存在逾期打样/生产记录，就把该询单下的特殊尺码款式都计入信号，而不是
精确判断"延期的就是这个特殊尺码款式本身"。前端必须展示这一限制说明。
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem
from app.models.production_record import ProductionRecord
from app.models.sample_record import SampleRecord

# 与 warning_service /产品工艺分析中"逾期打样"的口径保持一致，不另造一套判断标准。
SAMPLE_NON_OVERDUE_STATUSES = {"approved", "rejected", "cancelled", "sent", "received"}
PRODUCTION_DELAYED_STATUSES = {"delayed"}
PRODUCTION_DELAY_RISK_LEVELS = {"medium", "high"}

ORDER_PRIORITY_STATUSES = {"下单", "已下单", "确认转单"}
QUOTE_PRIORITY_STATUSES = {"已报价"}

SPAN_BUCKETS = ["未标准化", "单尺码", "窄跨度（2-3）", "中跨度（4-5）", "宽跨度（6+）"]


def _filled(v: Any) -> bool:
    return bool(v is not None and str(v).strip())


def has_size_range(item: InquiryItem) -> bool:
    return _filled(item.size_range)


def has_standard_sizes(item: InquiryItem) -> bool:
    return len(item.sizes) > 0


def has_priority_status(inquiry: Inquiry | None) -> bool:
    if not inquiry:
        return False
    return (inquiry.order_status in ORDER_PRIORITY_STATUSES) or (inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def size_span_count(item: InquiryItem) -> int:
    return len(item.sizes)


def span_bucket(count: int) -> str:
    if count == 0:
        return "未标准化"
    if count == 1:
        return "单尺码"
    if count <= 3:
        return "窄跨度（2-3）"
    if count <= 5:
        return "中跨度（4-5）"
    return "宽跨度（6+）"


def missing_size_fields(item: InquiryItem) -> list[str]:
    missing: list[str] = []
    if not has_size_range(item):
        missing.append("原始尺码范围")
    if not has_standard_sizes(item):
        missing.append("标准化尺码")
    return missing


def is_priority_candidate(item: InquiryItem) -> bool:
    """
    优先补录清单入围条件（对应需求文档第十节 1-3 条规则，三者取或）：
      1. 无任何尺码资料，或者有原始范围但没有标准化尺码（即缺标准化尺码）；
      2. 有特殊尺码但缺少原始尺码范围——即使该款式已经有标准化尺码记录，
         只要原始范围文字缺失，仍然入围（这是与"缺标准化尺码"完全独立的
         另一个缺失维度，不能因为已有标准化标签就被排除）。
    """
    no_std = not has_standard_sizes(item)
    is_special_item = any(s.is_special_size for s in item.sizes)
    return no_std or (is_special_item and not has_size_range(item))


def priority_tier(item: InquiryItem, inquiry: Inquiry | None) -> int:
    """
    优先级分层（数值越大越优先），对应需求文档第十节 1-3 条规则：
      3：已下单/已报价 且 没有任何尺码资料（既无原始范围也无标准化尺码）；
      2：已下单/已报价 且 有原始范围但没有标准化尺码；
      1：有特殊尺码 且 缺少原始尺码范围，但不满足上面两条；
      0：其余满足入围条件的情形。
    """
    priority_status = has_priority_status(inquiry)
    no_range = not has_size_range(item)
    no_std = not has_standard_sizes(item)
    is_special_item = any(s.is_special_size for s in item.sizes)

    if priority_status and no_range and no_std:
        return 3
    if priority_status and has_size_range(item) and no_std:
        return 2
    if is_special_item and no_range:
        return 1
    return 0


def risk_hint(item: InquiryItem) -> str:
    is_special_item = any(s.is_special_size for s in item.sizes)
    no_range = not has_size_range(item)
    no_std = not has_standard_sizes(item)
    if is_special_item and no_range:
        return "包含特殊尺码，但缺少原始尺码范围说明"
    if not no_range and no_std:
        return "已有尺码范围，但尚未完成尺码标准化"
    if no_range and no_std:
        return "缺少任何尺码资料"
    return ""


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    return (
        entry["_tier"],
        entry["missing_field_count"],
        entry["inquiry_date"] or date.min,
        entry["_updated_at"] or datetime.min,
    )


def normalize_size_key(code: str) -> str:
    return code.strip().lower()


def mode_value(counter: Counter) -> Any:
    return counter.most_common(1)[0][0] if counter else None


def avg_or_none(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 4) if vals else None


async def fetch_overdue_sample_inquiry_ids(db, inquiry_ids: set) -> set:
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
