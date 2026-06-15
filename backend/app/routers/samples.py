"""
打样记录路由

权限规则：
  - admin        → 全量查看/增/改/删
  - group_leader → 本组查看/增/改；不能删
  - sales        → 自己负责或协助询单的打样，查看/增/改；不能删
  - viewer       → 只读（按组过滤）
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_view_inquiry
from app.database import get_db
from app.models.factory import Factory
from app.models.inquiry import Inquiry
from app.models.sample_record import SampleRecord
from app.services.operation_log_service import log_kwargs_from_user, safe_log
from app.services.sample_service import generate_sample_no, get_sample_stats, sample_snapshot

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(tags=["samples"])


# ── Permission helpers ────────────────────────────────────────────────────────

def _apply_sample_scope(q, user):
    """Filter query to samples visible to user."""
    if user.role == "admin":
        return q
    if user.role in ("group_leader", "viewer"):
        return q.where(SampleRecord.group_name == user.group_name)
    if user.role == "sales":
        names = [user.username]
        if user.display_name:
            names.append(user.display_name)
        return q.where(SampleRecord.responsible_sales.in_(names))
    return q.where(SampleRecord.id.is_(None))


def _can_edit_sample(user, sample: SampleRecord) -> bool:
    if user.role == "viewer":
        return False
    if user.role == "admin":
        return True
    if user.role == "group_leader":
        return sample.group_name == user.group_name
    if user.role == "sales":
        names = {user.username}
        if user.display_name:
            names.add(user.display_name)
        return sample.responsible_sales in names
    return False


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SampleCreate(BaseModel):
    inquiry_id: uuid.UUID | None = None
    factory_id: uuid.UUID | None = None
    customer_code: str | None = None
    customer_short_name: str | None = None
    factory_name: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    sample_type: str | None = None
    sample_quantity: int | None = None
    assigned_to_factory_at: date | None = None
    factory_due_date: date | None = None
    sample_fee: float | None = None
    fee_paid_by: str | None = None
    fee_payment_status: str | None = None
    responsible_sales: str | None = None
    group_name: str | None = None
    remark: str | None = None


class SampleUpdate(BaseModel):
    sample_type: str | None = None
    sample_quantity: int | None = None
    sample_status: str | None = None
    assigned_to_factory_at: date | None = None
    factory_due_date: date | None = None
    sample_sent_at: date | None = None
    courier_company: str | None = None
    tracking_no: str | None = None
    customer_received_at: date | None = None
    customer_feedback: str | None = None
    revision_count: int | None = None
    final_result: str | None = None
    sample_fee: float | None = None
    fee_paid_by: str | None = None
    fee_payment_status: str | None = None
    factory_id: uuid.UUID | None = None
    factory_name: str | None = None
    customer_code: str | None = None
    customer_short_name: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    responsible_sales: str | None = None
    group_name: str | None = None
    remark: str | None = None


class SampleOut(BaseModel):
    id: uuid.UUID
    sample_no: str
    inquiry_id: uuid.UUID | None
    inquiry_no: str | None
    customer_code: str | None
    customer_short_name: str | None
    factory_id: uuid.UUID | None
    factory_name: str | None
    product_category: str | None
    product_name: str | None
    series_name: str | None
    sample_type: str | None
    sample_quantity: int | None
    sample_status: str
    assigned_to_factory_at: date | None
    factory_due_date: date | None
    sample_sent_at: date | None
    courier_company: str | None
    tracking_no: str | None
    customer_received_at: date | None
    customer_feedback: str | None
    revision_count: int
    final_result: str
    sample_fee: float | None
    fee_paid_by: str | None
    fee_payment_status: str | None
    responsible_sales: str | None
    group_name: str | None
    remark: str | None
    created_by: str | None
    created_at: Any
    updated_at: Any

    model_config = {"from_attributes": True}


# ── Stats (must come before /{sample_id}) ─────────────────────────────────────

@router.get("/samples/stats")
async def get_stats(db: DbDep, user: UserDep):
    return await get_sample_stats(db, user)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/samples", response_model=dict)
async def list_samples(
    db: DbDep,
    user: UserDep,
    sample_no:          str | None = Query(None),
    inquiry_no:         str | None = Query(None),
    customer_short_name: str | None = Query(None),
    factory_name:       str | None = Query(None),
    product_category:   str | None = Query(None),
    product_name:       str | None = Query(None),
    series_name:        str | None = Query(None),
    sample_type:        str | None = Query(None),
    sample_status:      str | None = Query(None),
    final_result:       str | None = Query(None),
    responsible_sales:  str | None = Query(None),
    group_name:         str | None = Query(None),
    start_date:         date | None = Query(None),
    end_date:           date | None = Query(None),
    page:               int = Query(1, ge=1),
    page_size:          int = Query(50, ge=1, le=200),
    sort_by:            str | None = Query(None),
    sort_order:         str | None = Query("desc"),
):
    q = select(SampleRecord)
    q = _apply_sample_scope(q, user)

    if sample_no:
        q = q.where(SampleRecord.sample_no.ilike(f"%{sample_no}%"))
    if inquiry_no:
        q = q.where(SampleRecord.inquiry_no.ilike(f"%{inquiry_no}%"))
    if customer_short_name:
        q = q.where(SampleRecord.customer_short_name.ilike(f"%{customer_short_name}%"))
    if factory_name:
        q = q.where(SampleRecord.factory_name.ilike(f"%{factory_name}%"))
    if product_category:
        q = q.where(SampleRecord.product_category.ilike(f"%{product_category}%"))
    if product_name:
        q = q.where(SampleRecord.product_name.ilike(f"%{product_name}%"))
    if series_name:
        q = q.where(SampleRecord.series_name.ilike(f"%{series_name}%"))
    if sample_type:
        q = q.where(SampleRecord.sample_type == sample_type)
    if sample_status:
        q = q.where(SampleRecord.sample_status == sample_status)
    if final_result:
        q = q.where(SampleRecord.final_result == final_result)
    if responsible_sales:
        q = q.where(SampleRecord.responsible_sales.ilike(f"%{responsible_sales}%"))
    if group_name:
        q = q.where(SampleRecord.group_name.ilike(f"%{group_name}%"))
    if start_date:
        q = q.where(SampleRecord.created_at >= start_date)
    if end_date:
        q = q.where(SampleRecord.created_at <= end_date)

    # count
    from sqlalchemy import func as sqlfunc
    count_q = select(sqlfunc.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # sort
    sort_col = {
        "factory_due_date": SampleRecord.factory_due_date,
        "created_at":       SampleRecord.created_at,
        "sample_sent_at":   SampleRecord.sample_sent_at,
    }.get(sort_by or "", SampleRecord.created_at)
    q = q.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)

    items = list((await db.execute(q)).scalars().all())
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [SampleOut.model_validate(s).model_dump() for s in items],
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/samples", response_model=SampleOut, status_code=201)
async def create_sample(body: SampleCreate, db: DbDep, user: UserDep, request: Request):
    if user.role == "viewer":
        raise HTTPException(403, "只读角色不能创建打样记录")

    data: dict[str, Any] = body.model_dump(exclude_none=True)

    # Auto-fill from inquiry
    if body.inquiry_id:
        inq = await db.get(Inquiry, body.inquiry_id)
        if not inq:
            raise HTTPException(404, "关联询单不存在")
        if not can_view_inquiry(inq, user):
            raise HTTPException(403, "无权访问该询单")
        data.setdefault("inquiry_no",           inq.inquiry_no)
        data.setdefault("customer_code",        inq.customer_code)
        data.setdefault("customer_short_name",  inq.customer_short_name)
        data.setdefault("product_category",     inq.product_category)
        data.setdefault("product_name",         inq.product_name)
        data.setdefault("series_name",          inq.series_name)
        data.setdefault("responsible_sales",    inq.responsible_sales)
        data.setdefault("group_name",           inq.group_name)

    # Auto-fill factory_name from factory_id
    if body.factory_id and "factory_name" not in data:
        fct = await db.get(Factory, body.factory_id)
        if fct:
            data["factory_name"] = fct.factory_name

    # Auto-fill responsible_sales/group_name from current user if not provided
    if user.role == "sales" and not data.get("responsible_sales"):
        data["responsible_sales"] = user.display_name or user.username
    if user.role in ("sales", "group_leader") and not data.get("group_name"):
        data["group_name"] = user.group_name

    # Scope check for group_leader
    if user.role == "group_leader" and data.get("group_name") and data["group_name"] != user.group_name:
        raise HTTPException(403, "组长只能在本组内创建打样记录")

    sample_no = await generate_sample_no(db)
    sample = SampleRecord(
        id=uuid.uuid4(),
        sample_no=sample_no,
        created_by=user.username,
        **data,
    )
    db.add(sample)
    await db.flush()
    await db.refresh(sample)
    await db.commit()
    await db.refresh(sample)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="sample_create",
        target_type="sample",
        target_id=str(sample.id),
        inquiry_id=sample.inquiry_id,
        inquiry_no=sample.inquiry_no,
        description=f"创建打样记录 {sample_no}",
        after_data=sample_snapshot(sample),
        request=request,
    )
    return sample


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/samples/{sample_id}", response_model=SampleOut)
async def get_sample(sample_id: uuid.UUID, db: DbDep, user: UserDep):
    sample = await db.get(SampleRecord, sample_id)
    if not sample:
        raise HTTPException(404, "打样记录不存在")

    # Scope check
    if user.role == "group_leader" or user.role == "viewer":
        if sample.group_name != user.group_name:
            raise HTTPException(403, "无权查看该打样记录")
    elif user.role == "sales":
        names = {user.username}
        if user.display_name:
            names.add(user.display_name)
        if sample.responsible_sales not in names:
            raise HTTPException(403, "无权查看该打样记录")

    return sample


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/samples/{sample_id}", response_model=SampleOut)
async def update_sample(
    sample_id: uuid.UUID, body: SampleUpdate, db: DbDep, user: UserDep, request: Request
):
    sample = await db.get(SampleRecord, sample_id)
    if not sample:
        raise HTTPException(404, "打样记录不存在")
    if not _can_edit_sample(user, sample):
        raise HTTPException(403, "无权编辑该打样记录")

    before = sample_snapshot(sample)
    old_status = sample.sample_status

    # Auto-fill factory_name if factory_id is updated
    update_data = body.model_dump(exclude_none=True)
    if "factory_id" in update_data and "factory_name" not in update_data:
        fct = await db.get(Factory, update_data["factory_id"])
        if fct:
            update_data["factory_name"] = fct.factory_name

    for field, val in update_data.items():
        setattr(sample, field, val)

    await db.flush()
    await db.refresh(sample)
    await db.commit()
    await db.refresh(sample)

    after = sample_snapshot(sample)

    action_type = "sample_status_change" if "sample_status" in update_data and old_status != sample.sample_status else "sample_update"

    await safe_log(
        **log_kwargs_from_user(user),
        action_type=action_type,
        target_type="sample",
        target_id=str(sample.id),
        inquiry_id=sample.inquiry_id,
        inquiry_no=sample.inquiry_no,
        description=f"编辑打样记录 {sample.sample_no}",
        before_data=before,
        after_data=after,
        request=request,
    )
    return sample


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/samples/{sample_id}", status_code=204)
async def delete_sample(sample_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "只有管理员可以删除打样记录")

    sample = await db.get(SampleRecord, sample_id)
    if not sample:
        raise HTTPException(404, "打样记录不存在")

    snap = sample_snapshot(sample)
    await db.delete(sample)
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="sample_delete",
        target_type="sample",
        target_id=str(sample_id),
        inquiry_no=snap.get("sample_no"),
        description=f"删除打样记录 {snap.get('sample_no')}",
        before_data=snap,
        request=request,
    )


# ── By inquiry ────────────────────────────────────────────────────────────────

@router.get("/inquiries/{inquiry_id}/samples", response_model=list[SampleOut])
async def get_inquiry_samples(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(404, "询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(403, "无权查看该询单")

    q = (
        select(SampleRecord)
        .where(SampleRecord.inquiry_id == inquiry_id)
        .order_by(SampleRecord.created_at.desc())
    )
    return list((await db.execute(q)).scalars().all())


# ── By factory ────────────────────────────────────────────────────────────────

@router.get("/factories/{factory_id}/samples", response_model=list[SampleOut])
async def get_factory_samples(factory_id: uuid.UUID, db: DbDep, user: UserDep):
    q = select(SampleRecord).where(SampleRecord.factory_id == factory_id)
    q = _apply_sample_scope(q, user)
    q = q.order_by(SampleRecord.created_at.desc())
    return list((await db.execute(q)).scalars().all())


# ── By customer ───────────────────────────────────────────────────────────────

@router.get("/customers/{customer_code}/samples", response_model=list[SampleOut])
async def get_customer_samples(customer_code: str, db: DbDep, user: UserDep):
    q = select(SampleRecord).where(SampleRecord.customer_code == customer_code)
    q = _apply_sample_scope(q, user)
    q = q.order_by(SampleRecord.created_at.desc())
    return list((await db.execute(q)).scalars().all())
