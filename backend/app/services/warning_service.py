"""
预警规则引擎。

generate_warnings_for_inquiry() — 纯函数，对单条 Inquiry 产出预警列表。
scan_inquiry_warnings()         — 刷新单条询单的预警（先删未处理旧预警，再插新预警）。
scan_all_warnings()             — 全量扫描（用于手动触发或导入后批量刷新）。
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiry import Inquiry
from app.models.inquiry_warning import InquiryWarning

# 跟进超时阈值（小时）
FOLLOW_UP_TIMEOUT_HOURS = 24

# 报价情况中"未报价"状态集合
_UNQUOTED_STATUSES = {None, "", "未报价", "待报价", "待跟进"}

# 毛利率异常阈值
_GP_LOW_THRESHOLD  = 0    # 低于此值（负毛利）→ high
_GP_HIGH_THRESHOLD = 80   # 高于此值 → medium


def _w(
    inquiry: Inquiry,
    warning_type: str,
    warning_level: str,
    warning_message: str,
    field_name: str | None = None,
    current_value: str | None = None,
    suggested_action: str | None = None,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "inquiry_id": inquiry.id,
        "inquiry_no": inquiry.inquiry_no,
        "warning_type": warning_type,
        "warning_level": warning_level,
        "warning_message": warning_message,
        "field_name": field_name,
        "current_value": current_value,
        "suggested_action": suggested_action,
        "is_resolved": False,
    }


# ── 规则 1：必填字段缺失 ──────────────────────────────────────────────────────

def _check_missing_fields(inquiry: Inquiry) -> list[dict]:
    results = []

    if not inquiry.customer_short_name and not inquiry.customer_code:
        results.append(_w(
            inquiry,
            "missing_required_field", "high",
            "必填字段缺失：客户简称和客户代码均为空",
            field_name="customer_short_name / customer_code",
            suggested_action="补充客户简称或客户代码",
        ))

    for field, label, level in [
        ("group_name",        "所属小组",   "medium"),
        ("responsible_sales", "负责业务员", "medium"),
        ("product_name",      "品名",       "medium"),
        ("quantity",          "数量",       "medium"),
        ("inquiry_date",      "询单日期",   "medium"),
    ]:
        val = getattr(inquiry, field)
        if val is None or val == "":
            results.append(_w(
                inquiry,
                "missing_required_field", level,
                f"必填字段缺失：{label}",
                field_name=field,
                suggested_action=f"补充{label}",
            ))

    return results


# ── 规则 2：跟进超时 ──────────────────────────────────────────────────────────

def _check_follow_up_timeout(inquiry: Inquiry) -> list[dict]:
    if inquiry.inquiry_date is None:
        return []
    if inquiry.quote_status not in _UNQUOTED_STATUSES:
        return []

    now = datetime.now(tz=timezone.utc).date()
    delta_hours = (now - inquiry.inquiry_date).total_seconds() / 3600
    if delta_hours <= FOLLOW_UP_TIMEOUT_HOURS:
        return []

    days = int(delta_hours // 24)
    label = f"{days} 天" if days >= 1 else f"{int(delta_hours)} 小时"
    return [_w(
        inquiry,
        "follow_up_timeout", "high",
        f"询单已超过 {label} 未报价（询单日期：{inquiry.inquiry_date}）",
        field_name="quote_status",
        current_value=inquiry.quote_status or "（空）",
        suggested_action="尽快联系客户并更新报价情况",
    )]


# ── 规则 3：价格异常 ──────────────────────────────────────────────────────────

def _check_price_abnormal(inquiry: Inquiry) -> list[dict]:
    results = []

    def _num(val: Any) -> float | None:
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    fq = _num(inquiry.final_quote)
    fp = _num(inquiry.factory_price)
    gp = _num(inquiry.gross_profit_rate)
    op = _num(inquiry.order_unit_price)

    if fq is not None and fq < 0:
        results.append(_w(inquiry, "price_abnormal", "high",
            f"最终报价为负数（{fq}），请核查",
            field_name="final_quote", current_value=str(fq),
            suggested_action="核查最终报价是否填写有误"))

    if fp is not None and fp < 0:
        results.append(_w(inquiry, "price_abnormal", "high",
            f"工厂价为负数（{fp}），请核查",
            field_name="factory_price", current_value=str(fp),
            suggested_action="核查工厂价是否填写有误"))

    if op is not None and op < 0:
        results.append(_w(inquiry, "price_abnormal", "high",
            f"下单单价为负数（{op}），请核查",
            field_name="order_unit_price", current_value=str(op),
            suggested_action="核查下单单价是否填写有误"))

    if gp is not None and gp < _GP_LOW_THRESHOLD:
        results.append(_w(inquiry, "price_abnormal", "high",
            f"毛利率为负（{gp:.1f}%），存在亏损风险",
            field_name="gross_profit_rate", current_value=f"{gp:.1f}%",
            suggested_action="核查报价与成本，确认是否亏损销售"))

    if gp is not None and gp > _GP_HIGH_THRESHOLD:
        results.append(_w(inquiry, "price_abnormal", "medium",
            f"毛利率异常偏高（{gp:.1f}%），请确认数据准确性",
            field_name="gross_profit_rate", current_value=f"{gp:.1f}%",
            suggested_action="确认毛利率数据是否正确"))

    return results


# ── 规则 4：状态矛盾 ──────────────────────────────────────────────────────────

def _check_status_conflict(inquiry: Inquiry) -> list[dict]:
    results = []
    os = inquiry.order_status
    qs = inquiry.quote_status

    if os == "下单":
        if inquiry.order_unit_price is None:
            results.append(_w(inquiry, "status_conflict", "medium",
                '订单状态为【下单】但缺少下单单价',
                field_name="order_unit_price",
                suggested_action="补充下单单价"))
        if inquiry.order_quantity is None:
            results.append(_w(inquiry, "status_conflict", "medium",
                '订单状态为【下单】但缺少下单数量',
                field_name="order_quantity",
                suggested_action="补充下单数量"))
        if inquiry.order_date is None:
            results.append(_w(inquiry, "status_conflict", "low",
                '订单状态为【下单】但缺少下单日期',
                field_name="order_date",
                suggested_action="补充下单日期"))
        if qs in _UNQUOTED_STATUSES:
            results.append(_w(inquiry, "status_conflict", "medium",
                f'订单已下单但报价情况为【{qs or "空"}】，状态矛盾',
                field_name="quote_status",
                current_value=qs or "（空）",
                suggested_action='将报价情况更新为【已报价】'))

    if qs == "已报价" and inquiry.final_quote is None:
        results.append(_w(inquiry, "status_conflict", "medium",
            '报价情况为【已报价】但未填写最终报价金额',
            field_name="final_quote",
            suggested_action="补充最终报价金额"))

    return results


# ── 主入口 ────────────────────────────────────────────────────────────────────

def generate_warnings_for_inquiry(inquiry: Inquiry) -> list[dict]:
    results: list[dict] = []
    results.extend(_check_missing_fields(inquiry))
    results.extend(_check_follow_up_timeout(inquiry))
    results.extend(_check_price_abnormal(inquiry))
    results.extend(_check_status_conflict(inquiry))
    return results


async def scan_inquiry_warnings(db: AsyncSession, inquiry: Inquiry) -> int:
    """
    刷新单条询单的预警（全量替换模式，用于导入/编辑后立即同步）。
    删除所有未处理预警，重新生成。返回新增数量。
    """
    await db.execute(
        delete(InquiryWarning).where(
            InquiryWarning.inquiry_id == inquiry.id,
            InquiryWarning.is_resolved == False,  # noqa: E712
        )
    )
    warnings = generate_warnings_for_inquiry(inquiry)
    for w in warnings:
        db.add(InquiryWarning(**w))
    return len(warnings)


async def run_check_for_inquiries(db: AsyncSession, inquiries: list[Inquiry]) -> dict[str, int]:
    """
    智能增量扫描：
    - 已修复的问题 → 删除对应未处理预警
    - 已存在的未处理预警 → 保留（保留 created_at，不重复生成）
    - 新发现的问题   → 新增预警
    """
    total_added = 0
    total_removed = 0

    for inq in inquiries:
        # 取当前未处理预警
        res = await db.execute(
            select(InquiryWarning).where(
                InquiryWarning.inquiry_id == inq.id,
                InquiryWarning.is_resolved == False,  # noqa: E712
            )
        )
        existing = list(res.scalars().all())
        existing_keys = {(w.warning_type, w.field_name) for w in existing}

        # 重新计算应有的预警
        new_warnings = generate_warnings_for_inquiry(inq)
        new_keys = {(w["warning_type"], w["field_name"]) for w in new_warnings}

        # 删除已修复（不再出现）的预警
        for w in existing:
            if (w.warning_type, w.field_name) not in new_keys:
                await db.delete(w)
                total_removed += 1

        # 新增尚未存在的预警
        for w_data in new_warnings:
            if (w_data["warning_type"], w_data["field_name"]) not in existing_keys:
                db.add(InquiryWarning(**w_data))
                total_added += 1

    await db.flush()
    return {
        "scanned": len(inquiries),
        "warnings_added": total_added,
        "warnings_removed": total_removed,
    }


async def scan_all_warnings(db: AsyncSession) -> dict[str, int]:
    """全量扫描（用于初始化或管理员一键重算）。"""
    result = await db.execute(select(Inquiry))
    inquiries = list(result.scalars().all())
    inquiry_result = await run_check_for_inquiries(db, inquiries)
    sample_result = await scan_sample_overdue_warnings(db)
    production_result = await scan_production_delay_warnings(db)
    return {
        "scanned": inquiry_result["scanned"],
        "warnings_added": inquiry_result["warnings_added"] + sample_result["warnings_added"] + production_result["warnings_added"],
        "warnings_removed": inquiry_result["warnings_removed"] + sample_result["warnings_removed"] + production_result["warnings_removed"],
    }


async def scan_production_delay_warnings(db: AsyncSession) -> dict[str, int]:
    """
    扫描逾期生产跟单（有 inquiry_id），生成/清理 production_delay 预警。
    逾期规则：delivery_date < today，且 production_status 不在终态，且有 inquiry_id。
    """
    from app.models.production_record import ProductionRecord

    _terminal = {"completed", "shipped", "cancelled"}
    today = date.today()

    overdue_res = await db.execute(
        select(ProductionRecord).where(
            ProductionRecord.delivery_date.isnot(None),
            ProductionRecord.delivery_date < today,
            ProductionRecord.inquiry_id.isnot(None),
            ~ProductionRecord.production_status.in_(_terminal),
        )
    )
    overdue = list(overdue_res.scalars().all())
    overdue_nos = {r.production_no for r in overdue}

    existing_res = await db.execute(
        select(InquiryWarning).where(
            InquiryWarning.warning_type == "production_delay",
            InquiryWarning.is_resolved == False,  # noqa: E712
        )
    )
    existing = list(existing_res.scalars().all())
    existing_nos = {w.current_value for w in existing}

    removed = 0
    for w in existing:
        if w.current_value not in overdue_nos:
            await db.delete(w)
            removed += 1

    added = 0
    for rec in overdue:
        if rec.production_no not in existing_nos:
            days = (today - rec.delivery_date).days
            db.add(InquiryWarning(
                id=uuid.uuid4(),
                inquiry_id=rec.inquiry_id,
                inquiry_no=rec.inquiry_no or "",
                warning_type="production_delay",
                warning_level="high",
                warning_message=(
                    f"生产已超过预计交期仍未完成（跟单编号：{rec.production_no}，逾期 {days} 天）"
                ),
                field_name="delivery_date",
                current_value=rec.production_no,
                suggested_action="联系工厂确认生产进度并评估延期影响",
                is_resolved=False,
            ))
            added += 1

    await db.flush()
    return {"warnings_added": added, "warnings_removed": removed}


async def scan_sample_overdue_warnings(db: AsyncSession) -> dict[str, int]:
    """
    扫描逾期打样（有 inquiry_id），生成/清理 sample_overdue 预警。
    逾期规则：factory_due_date < today，且 sample_status 不在终态中，且有 inquiry_id。
    """
    from app.models.sample_record import SampleRecord

    _non_overdue_statuses = {"approved", "rejected", "cancelled", "sent", "received"}
    today = date.today()

    # Overdue samples with inquiry_id
    overdue_res = await db.execute(
        select(SampleRecord).where(
            SampleRecord.factory_due_date.isnot(None),
            SampleRecord.factory_due_date < today,
            SampleRecord.inquiry_id.isnot(None),
            ~SampleRecord.sample_status.in_(_non_overdue_statuses),
        )
    )
    overdue_samples = list(overdue_res.scalars().all())
    overdue_sample_nos = {s.sample_no for s in overdue_samples}

    # Existing unresolved sample_overdue warnings
    existing_res = await db.execute(
        select(InquiryWarning).where(
            InquiryWarning.warning_type == "sample_overdue",
            InquiryWarning.is_resolved == False,  # noqa: E712
        )
    )
    existing = list(existing_res.scalars().all())
    existing_sample_nos = {w.current_value for w in existing}

    removed = 0
    for w in existing:
        if w.current_value not in overdue_sample_nos:
            await db.delete(w)
            removed += 1

    added = 0
    for sample in overdue_samples:
        if sample.sample_no not in existing_sample_nos:
            days = (today - sample.factory_due_date).days
            db.add(InquiryWarning(
                id=uuid.uuid4(),
                inquiry_id=sample.inquiry_id,
                inquiry_no=sample.inquiry_no or "",
                warning_type="sample_overdue",
                warning_level="high",
                warning_message=(
                    f"打样已超过工厂预计交期仍未完成（打样编号：{sample.sample_no}，逾期 {days} 天）"
                ),
                field_name="factory_due_date",
                current_value=sample.sample_no,
                suggested_action="联系工厂确认打样进度",
                is_resolved=False,
            ))
            added += 1

    await db.flush()
    return {"warnings_added": added, "warnings_removed": removed}
