"""
资料补录任务（报价资料分析 Step 10）。

不重新发明一套"缺失字段"统计口径——任务的 missing_fields 永远用报价资料
完整度（Step 4）现成的 missing_key_fields() / classify_item() 重新计算，
这样无论任务是从哪个分析页面（总览/工艺/尺码/数量/填报人/...）创建的，
都落在同一套canonical 字段命名上："款号"/"品名"/"数量"/"报价单填报人"/
"原始工艺说明/标准化工艺标签"/"原始尺码范围/标准化尺码"——任务关闭时的
"重新检查该字段是否已补齐"才能可靠进行，不用去解析各分析页面文案不统一
的 missing_fields 字符串。

创建任务时即使前端传了别的 missing_fields 文案，也一律用服务端重新计算
的结果为准，只把前端传来的 source_module / source_reason 当成纯展示用
的"任务来自哪个分析页面"元数据，不参与任何逻辑判断。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem
from app.models.user import User
from app.services.quote_data_quality_service import (
    ORDER_PRIORITY_STATUSES,
    QUOTE_PRIORITY_STATUSES,
    missing_key_fields,
)

OPEN_STATUSES = {"open", "in_progress"}
ALL_STATUSES = {"open", "in_progress", "completed", "cancelled"}
PRIORITIES = {"high", "medium", "low"}

COMBO_FIELDS = {"款号", "原始工艺说明/标准化工艺标签", "原始尺码范围/标准化尺码", "报价单填报人"}


def compute_missing_fields(item: InquiryItem) -> list[str]:
    """复用 Step 4 的字段缺失判定口径，不另造一套。"""
    return missing_key_fields(item)


def default_priority(item: InquiryItem, inquiry: Inquiry, missing_fields: list[str]) -> str:
    """
    默认优先级规则：
      已下单 且 缺关键资料 → high
      已报价 且 缺关键资料 → high
      同时缺款号/工艺/尺码/填报人 → high
      其余 → medium
    """
    if not missing_fields:
        return "low"
    if inquiry.order_status in ORDER_PRIORITY_STATUSES:
        return "high"
    if inquiry.quote_status in QUOTE_PRIORITY_STATUSES:
        return "high"
    if COMBO_FIELDS.issubset(set(missing_fields)):
        return "high"
    return "medium"


async def default_assignee(db, item: InquiryItem, inquiry: Inquiry) -> str | None:
    """
    默认负责人：优先 quote_prepared_by，再 responsible_sales，都没有则不自动指派。
    不会自动把任务分给 viewer——候选人若解析到的账号角色是 viewer，视为未指派。
    """
    from sqlalchemy import select

    candidate = (item.quote_prepared_by or "").strip() or (inquiry.responsible_sales or "").strip()
    if not candidate:
        return None

    user = (await db.execute(
        select(User).where((User.username == candidate) | (User.display_name == candidate))
    )).scalars().first()
    if user and user.role == "viewer":
        return None
    return candidate


def is_open(task) -> bool:
    return task.status in OPEN_STATUSES


def auto_complete_check(task, item: InquiryItem) -> dict[str, Any]:
    """
    款式资料编辑后，重新核对任务创建时记录的目标缺失字段（不检查任务范围
    之外的字段）。返回 dict 描述本次检查的结果，调用方据此决定是否落库：
      {"changed": bool, "still_missing": list[str], "now_complete": bool}
    """
    if task.status not in OPEN_STATUSES:
        return {"changed": False, "still_missing": task.missing_fields_json, "now_complete": False}

    current_missing = set(compute_missing_fields(item))
    target_fields = set(task.missing_fields_json)
    still_missing = sorted(target_fields & current_missing)

    changed = still_missing != sorted(task.missing_fields_json)
    return {
        "changed": changed,
        "still_missing": still_missing,
        "now_complete": len(still_missing) == 0,
    }


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
