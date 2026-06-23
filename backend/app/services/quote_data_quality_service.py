"""
报价资料数据完整度统计（报价资料分析 Step 4）。

统计的最小单位是 inquiry_items（款式明细），不是 inquiries——一个询单可能
有多个款式，每个款式的资料完整度应该独立判断，否则会掩盖"询单基本信息齐全
但具体某个款式缺资料"的情况。

口径说明（与需求文档第三/五/七节一致）：
  - 文本字段：NULL / 空字符串 / 全空格都算 missing。
  - quantity：NULL 算 missing；0 不算 missing。
  - 工艺/尺码：以关联子表（inquiry_item_processes / inquiry_item_sizes）
    是否存在至少一条记录判断"标准化标签是否已填写"；原始文本字段
    （process_description / size_range）单独判断，互不替代。
  - 完整度不是"是否全字段填写"，而是按"完整 / 部分完整 / 高缺失"三档判断，
    具体规则见 classify_item()。
  - 不会把缺失数据从分母里剔除，也不会对历史数据做任何猜测性补全。

已知限制：inquiry_items 没有自己的 import_batch_id 列，只有 inquiries 才有。
"按导入批次"统计因此是按"款式所属询单的导入批次"统计，而不是"这一条款式
本身是哪次导入/补录创建的"——如果一个询单先被导入创建，之后又手工追加了
新款式，那条新款式会被归到询单最初的导入批次下，这是当前数据结构下能做到
的最可靠近似，不做法猜测性关联或新增字段。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem

# ── 字段定义 ────────────────────────────────────────────────────────────────────

# (field_key, field_label) —— 用于 field_coverage 总览，覆盖需求文档第二节列出的全部字段
FIELD_DEFS: list[tuple[str, str]] = [
    ("style_no", "款号"),
    ("product_name", "品名"),
    ("product_category", "产品品类"),
    ("series_name", "系列"),
    ("quantity", "数量"),
    ("quote_prepared_by", "报价单填报人"),
    ("process_description", "原始工艺说明"),
    ("processes", "标准化工艺标签"),
    ("size_range", "原始尺码范围"),
    ("sizes", "标准化尺码"),
]
FIELD_LABELS: dict[str, str] = dict(FIELD_DEFS)

# 完整度等级判定 + 优先补录清单只关心 style_no / product_name / quantity /
# quote_prepared_by / 工艺（原始说明或标签其一）/ 尺码（原始范围或标签其一）
# 这 6 项"关键资料"（产品品类、系列不参与等级判定，但仍计入 field_coverage
# 总览，因为需求文档第二节明确要统计它们）。

LEVEL_RANK = {"high_missing": 2, "partial": 1, "complete": 0}
ORDER_PRIORITY_STATUSES = {"下单", "已下单", "确认转单"}
QUOTE_PRIORITY_STATUSES = {"已报价"}


def _filled_text(v: Any) -> bool:
    return bool(v is not None and str(v).strip())


def field_filled(item: InquiryItem, key: str) -> bool:
    """单个字段是否"已填写"。quantity 用 is not None；工艺/尺码标签用子表是否非空。"""
    if key == "quantity":
        return item.quantity is not None
    if key == "processes":
        return len(item.processes) > 0
    if key == "sizes":
        return len(item.sizes) > 0
    return _filled_text(getattr(item, key, None))


def classify_item(item: InquiryItem) -> str:
    """
    完整度三档判定：
      complete      —— style_no / product_name / quantity / quote_prepared_by 都填写，
                        且工艺（原始说明或标签其一）、尺码（原始范围或标签其一）也都有。
      high_missing  —— 缺品名；或者 style_no、工艺、尺码、填报人这四项全部缺失
                        （即除了可能有品名/数量外，几乎没有可用的款式资料）。
      partial       —— 不满足以上两种情况的其余所有情形（至少有品名，但仍缺部分资料）。
    """
    if not field_filled(item, "product_name"):
        return "high_missing"

    has_style = field_filled(item, "style_no")
    has_process = field_filled(item, "process_description") or field_filled(item, "processes")
    has_size = field_filled(item, "size_range") or field_filled(item, "sizes")
    has_preparer = field_filled(item, "quote_prepared_by")
    has_quantity = field_filled(item, "quantity")

    if has_style and has_process and has_size and has_preparer and has_quantity:
        return "complete"
    if not has_style and not has_process and not has_size and not has_preparer:
        return "high_missing"
    return "partial"


def missing_key_fields(item: InquiryItem) -> list[str]:
    """
    返回缺失的关键字段中文名列表，用于优先补录清单。

    工艺、尺码分别按"原始说明/原始范围 或 标准化标签其一"做 OR 判断——必须与
    classify_item() 的口径保持一致，否则会出现"完整度等级=完整，但缺失字段
    列表非空"这种自相矛盾的展示（这正是本功能在浏览器验收阶段发现的真实问题：
    一个 process_description/size_range 都填了、只是没有标准化标签的款式，
    按 classify_item 已经算"完整"，却仍会被旧逻辑列进"优先补录"名单）。

    style_no / product_name / quantity / quote_prepared_by 仍按各自独立判断。
    """
    missing: list[str] = []
    if not field_filled(item, "style_no"):
        missing.append(FIELD_LABELS["style_no"])
    if not field_filled(item, "product_name"):
        missing.append(FIELD_LABELS["product_name"])
    if not field_filled(item, "quantity"):
        missing.append(FIELD_LABELS["quantity"])
    if not field_filled(item, "quote_prepared_by"):
        missing.append(FIELD_LABELS["quote_prepared_by"])
    if not (field_filled(item, "process_description") or field_filled(item, "processes")):
        missing.append(f"{FIELD_LABELS['process_description']}/{FIELD_LABELS['processes']}")
    if not (field_filled(item, "size_range") or field_filled(item, "sizes")):
        missing.append(f"{FIELD_LABELS['size_range']}/{FIELD_LABELS['sizes']}")
    return missing


def has_priority_status(inquiry: Inquiry) -> bool:
    """订单已下单或已报价的询单，补录优先级更高。"""
    return (inquiry.order_status in ORDER_PRIORITY_STATUSES) or (inquiry.quote_status in QUOTE_PRIORITY_STATUSES)


def priority_sort_key(entry: dict[str, Any]) -> tuple:
    """
    优先补录排序键（用于 sorted(..., reverse=True)，所有维度都是"值越大越靠前"）：
      1. 完整度等级（高缺失 > 部分完整 > 完整，理论上完整的不会进入候选列表）；
      2. 缺失关键字段数量；
      3. 询单日期新旧（越新越靠前，缺失日期视为最旧）；
      4. 是否已下单/已报价；
      5. 款式更新时间倒序。
    """
    return (
        LEVEL_RANK.get(entry["completeness_level"], 0),
        entry["missing_field_count"],
        entry["inquiry_date"] or date.min,
        entry["_has_priority_status"],
        entry["_updated_at"] or datetime.min,
    )
