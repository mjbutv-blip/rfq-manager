import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models import Inquiry, InquiryWarning
from app.schemas.inquiry_warning import InquiryWarningOut, InquiryWarningRich, WarningSummary
from app.services.warning_service import run_check_for_inquiries, scan_all_warnings, scan_sample_overdue_warnings, scan_production_delay_warnings
from app.services.operation_log_service import log_kwargs_from_user, safe_log

router = APIRouter(prefix="/warnings", tags=["warnings"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

# warning_level 排序：high=1, medium=2, low=3
_LEVEL_ORDER = case(
    (InquiryWarning.warning_level == "high",   1),
    (InquiryWarning.warning_level == "medium", 2),
    else_=3,
)


# ── 权限辅助：构建当前用户可见的 inquiry_id 子查询 ─────────────────────────────

def _scope_inquiry_ids(user):
    """返回当前用户可见的 inquiry_id 子查询，admin 返回 None（不限）。"""
    if user.role == "admin":
        return None
    if user.role in ("group_leader", "viewer"):
        return select(Inquiry.id).where(Inquiry.group_name == user.group_name)
    if user.role == "sales":
        names: list[str] = [user.username]
        if user.display_name:
            names.append(user.display_name)
        return select(Inquiry.id).where(
            or_(
                Inquiry.responsible_sales.in_(names),
                Inquiry.assisting_sales.in_(names),
            )
        )
    return select(Inquiry.id).where(Inquiry.id.is_(None))  # 未知角色：空集


def _apply_scope(q, user):
    ids = _scope_inquiry_ids(user)
    if ids is not None:
        q = q.where(InquiryWarning.inquiry_id.in_(ids))
    return q


# ── 汇总统计 ──────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=WarningSummary)
async def get_summary(db: DbDep, user: UserDep):
    base = select(InquiryWarning).where(InquiryWarning.is_resolved == False)  # noqa: E712
    base = _apply_scope(base, user)
    rows = list((await db.execute(base)).scalars().all())

    def _count(field: str, value: str) -> int:
        return sum(1 for r in rows if getattr(r, field) == value)

    return WarningSummary(
        total_unresolved=len(rows),
        high=_count("warning_level", "high"),
        medium=_count("warning_level", "medium"),
        low=_count("warning_level", "low"),
        missing_required_field=_count("warning_type", "missing_required_field"),
        follow_up_timeout=_count("warning_type", "follow_up_timeout"),
        price_abnormal=_count("warning_type", "price_abnormal"),
        status_conflict=_count("warning_type", "status_conflict"),
        sample_overdue=_count("warning_type", "sample_overdue"),
        production_delay=_count("warning_type", "production_delay"),
    )


# ── 预警列表（JOIN inquiries 带上下文字段） ───────────────────────────────────

@router.get("", response_model=dict)
async def list_warnings(
    db: DbDep,
    user: UserDep,
    warning_type:       str | None = Query(None),
    warning_level:      str | None = Query(None),
    is_resolved:        bool       = Query(False),
    inquiry_no:         str | None = Query(None),
    group_name:         str | None = Query(None),
    responsible_sales:  str | None = Query(None),
    customer_short_name: str | None = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by:    str | None = Query(None, description="warning_level|created_at"),
    sort_order: str | None = Query("desc"),
):
    """
    预警列表，附带询单上下文字段（JOIN inquiries）。
    返回 {total, page, page_size, items}。
    """
    # JOIN inquiries
    q = (
        select(InquiryWarning, Inquiry)
        .join(Inquiry, Inquiry.id == InquiryWarning.inquiry_id)
        .where(InquiryWarning.is_resolved == is_resolved)
    )
    q = _apply_scope(q, user)

    if warning_type:
        q = q.where(InquiryWarning.warning_type == warning_type)
    if warning_level:
        q = q.where(InquiryWarning.warning_level == warning_level)
    if inquiry_no:
        q = q.where(InquiryWarning.inquiry_no.ilike(f"%{inquiry_no}%"))
    if group_name:
        q = q.where(Inquiry.group_name.ilike(f"%{group_name}%"))
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales.ilike(f"%{responsible_sales}%"))
    if customer_short_name:
        q = q.where(Inquiry.customer_short_name.ilike(f"%{customer_short_name}%"))

    # count
    count_q = select(InquiryWarning.id).join(Inquiry, Inquiry.id == InquiryWarning.inquiry_id).where(
        InquiryWarning.is_resolved == is_resolved
    )
    count_q = _apply_scope(count_q, user)
    if warning_type:
        count_q = count_q.where(InquiryWarning.warning_type == warning_type)
    if warning_level:
        count_q = count_q.where(InquiryWarning.warning_level == warning_level)
    if inquiry_no:
        count_q = count_q.where(InquiryWarning.inquiry_no.ilike(f"%{inquiry_no}%"))
    if group_name:
        count_q = count_q.where(Inquiry.group_name.ilike(f"%{group_name}%"))
    if responsible_sales:
        count_q = count_q.where(Inquiry.responsible_sales.ilike(f"%{responsible_sales}%"))
    if customer_short_name:
        count_q = count_q.where(Inquiry.customer_short_name.ilike(f"%{customer_short_name}%"))

    total = len((await db.execute(count_q)).all())

    # 排序
    if sort_by == "created_at":
        order_col = InquiryWarning.created_at
        q = q.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())
    else:
        q = q.order_by(_LEVEL_ORDER, InquiryWarning.created_at.desc())

    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).all()

    items = [
        InquiryWarningRich.from_join(w, inq)
        for w, inq in rows
    ]

    return {"total": total, "page": page, "page_size": page_size, "items": [i.model_dump() for i in items]}


# ── 单条询单的所有预警 ─────────────────────────────────────────────────────────

@router.get("/by-inquiry/{inquiry_id}", response_model=list[InquiryWarningOut])
async def get_inquiry_warnings(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    """返回指定询单的全部预警（含已处理）。无权查看该询单则返回 403。"""
    from app.core.permissions import can_view_inquiry
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(404, "询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(403, "无权查看该询单")

    q = (
        select(InquiryWarning)
        .where(InquiryWarning.inquiry_id == inquiry_id)
        .order_by(_LEVEL_ORDER, InquiryWarning.created_at.desc())
    )
    return list((await db.execute(q)).scalars().all())


# ── 标记已处理 ────────────────────────────────────────────────────────────────

class ResolveBody(BaseModel):
    resolved_note: str | None = None


@router.patch("/{warning_id}/resolve", response_model=InquiryWarningOut)
async def resolve_warning(warning_id: uuid.UUID, body: ResolveBody, db: DbDep, user: UserDep, request: Request):
    """标记单条预警为已处理。viewer 不可操作。"""
    if user.role == "viewer":
        raise HTTPException(403, "只读角色不能处理预警")

    w = await db.get(InquiryWarning, warning_id)
    if not w:
        raise HTTPException(404, "预警不存在")

    ids = _scope_inquiry_ids(user)
    if ids is not None:
        res = await db.execute(
            select(Inquiry.id).where(
                Inquiry.id == w.inquiry_id,
                Inquiry.id.in_(ids),
            )
        )
        if not res.scalar_one_or_none():
            raise HTTPException(403, "无权处理该询单的预警")

    before = {
        "is_resolved": w.is_resolved,
        "warning_type": w.warning_type,
        "warning_level": w.warning_level,
        "warning_message": w.warning_message,
    }
    w.is_resolved   = True
    w.resolved_at   = datetime.now(tz=timezone.utc)
    w.resolved_by   = user.username
    w.resolved_note = body.resolved_note
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="warning_resolve",
        target_type="warning",
        target_id=str(warning_id),
        inquiry_id=w.inquiry_id,
        inquiry_no=w.inquiry_no,
        description="标记预警已处理",
        before_data=before,
        after_data={
            "is_resolved": True,
            "resolved_by": user.username,
            "resolved_note": body.resolved_note,
        },
        request=request,
    )
    return w


# ── 重新运行预警检查 ──────────────────────────────────────────────────────────

@router.post("/run-check", response_model=dict)
async def run_check(db: DbDep, user: UserDep, request: Request):
    """
    对当前用户可见范围内的询单重新运行预警检查。
    - 已修复的问题：对应预警自动删除
    - 已有的未处理预警：保留（保留创建时间，不重复生成）
    - 新问题：生成新预警
    viewer 不允许运行。
    """
    if user.role == "viewer":
        raise HTTPException(403, "只读角色不能运行预警检查")

    ids = _scope_inquiry_ids(user)
    if ids is None:
        inq_res = await db.execute(select(Inquiry))
    else:
        inq_res = await db.execute(select(Inquiry).where(Inquiry.id.in_(ids)))

    inquiries = list(inq_res.scalars().all())
    result = await run_check_for_inquiries(db, inquiries)
    sample_result = await scan_sample_overdue_warnings(db)
    production_result = await scan_production_delay_warnings(db)
    result["warnings_added"] = result.get("warnings_added", 0) + sample_result["warnings_added"] + production_result["warnings_added"]
    result["warnings_removed"] = result.get("warnings_removed", 0) + sample_result["warnings_removed"] + production_result["warnings_removed"]
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="warning_run_check",
        target_type="system",
        description="重新运行预警检查",
        after_data={
            "checked_inquiry_count": result.get("scanned", 0),
            "created_warning_count": result.get("warnings_added", 0),
            "resolved_warning_count": result.get("warnings_removed", 0),
        },
        request=request,
    )
    return result


# ── 保留旧的 /scan 供管理员用（redirect to run-check）───────────────────────

@router.post("/scan", response_model=dict)
async def trigger_scan(db: DbDep, user: UserDep):
    """全量预警扫描（仅 admin，兼容旧接口）。"""
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可触发全量扫描")
    result = await scan_all_warnings(db)
    await db.commit()
    return result
