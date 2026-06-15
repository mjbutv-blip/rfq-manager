"""
生产跟单路由

权限规则：
  - admin        → 全量查看/增/改/删
  - group_leader → 本组查看/增/改；不能删
  - sales        → 自己负责或协助询单的跟单，查看/增/改；不能删
  - viewer       → 只读（按组过滤）
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_view_inquiry
from app.database import get_db
from app.models.factory import Factory
from app.models.inquiry import Inquiry
from app.models.production_record import ProductionRecord
from app.services.operation_log_service import log_kwargs_from_user, safe_log
from app.services.production_service import (
    generate_production_no,
    get_production_stats,
    production_snapshot,
)

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(tags=["productions"])


# ── Permission helpers ────────────────────────────────────────────────────────

def _apply_scope(q, user):
    if user.role == "admin":
        return q
    if user.role in ("group_leader", "viewer"):
        return q.where(ProductionRecord.group_name == user.group_name)
    if user.role == "sales":
        names = [user.username]
        if user.display_name:
            names.append(user.display_name)
        return q.where(ProductionRecord.responsible_sales.in_(names))
    return q.where(ProductionRecord.id.is_(None))


def _can_edit(user, rec: ProductionRecord) -> bool:
    if user.role == "viewer":
        return False
    if user.role == "admin":
        return True
    if user.role == "group_leader":
        return rec.group_name == user.group_name
    if user.role == "sales":
        names = {user.username}
        if user.display_name:
            names.add(user.display_name)
        return rec.responsible_sales in names
    return False


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ProductionCreate(BaseModel):
    inquiry_id: uuid.UUID | None = None
    factory_id: uuid.UUID | None = None
    customer_code: str | None = None
    customer_short_name: str | None = None
    factory_name: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    order_quantity: int | None = None
    order_unit_price: float | None = None
    trade_amount: float | None = None
    order_date: date | None = None
    delivery_date: date | None = None
    responsible_sales: str | None = None
    group_name: str | None = None
    merchandiser: str | None = None
    remark: str | None = None


class ProductionUpdate(BaseModel):
    production_status: str | None = None
    fabric_status: str | None = None
    accessory_status: str | None = None
    production_schedule_status: str | None = None
    first_inspection_status: str | None = None
    mid_inspection_status: str | None = None
    final_inspection_status: str | None = None
    delay_risk_level: str | None = None
    delay_reason: str | None = None
    actual_finish_date: date | None = None
    delivery_date: date | None = None
    order_quantity: int | None = None
    order_unit_price: float | None = None
    trade_amount: float | None = None
    factory_id: uuid.UUID | None = None
    factory_name: str | None = None
    customer_code: str | None = None
    customer_short_name: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    responsible_sales: str | None = None
    group_name: str | None = None
    merchandiser: str | None = None
    remark: str | None = None


class ProductionOut(BaseModel):
    id: uuid.UUID
    production_no: str
    inquiry_id: uuid.UUID | None
    inquiry_no: str | None
    customer_code: str | None
    customer_short_name: str | None
    factory_id: uuid.UUID | None
    factory_name: str | None
    product_category: str | None
    product_name: str | None
    series_name: str | None
    order_quantity: int | None
    order_unit_price: float | None
    trade_amount: float | None
    order_date: date | None
    delivery_date: date | None
    production_status: str
    fabric_status: str | None
    accessory_status: str | None
    production_schedule_status: str | None
    first_inspection_status: str | None
    mid_inspection_status: str | None
    final_inspection_status: str | None
    delay_risk_level: str | None
    delay_reason: str | None
    actual_finish_date: date | None
    responsible_sales: str | None
    group_name: str | None
    merchandiser: str | None
    remark: str | None
    created_by: str | None
    created_at: Any
    updated_at: Any

    model_config = {"from_attributes": True}


# ── Stats (must come before /{production_id}) ─────────────────────────────────

@router.get("/productions/stats")
async def get_stats(db: DbDep, user: UserDep):
    return await get_production_stats(db, user)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/productions", response_model=dict)
async def list_productions(
    db: DbDep,
    user: UserDep,
    production_no:       str | None = Query(None),
    inquiry_no:          str | None = Query(None),
    customer_short_name: str | None = Query(None),
    factory_name:        str | None = Query(None),
    product_category:    str | None = Query(None),
    product_name:        str | None = Query(None),
    production_status:   str | None = Query(None),
    delay_risk_level:    str | None = Query(None),
    responsible_sales:   str | None = Query(None),
    group_name:          str | None = Query(None),
    merchandiser:        str | None = Query(None),
    start_date:          date | None = Query(None),
    end_date:            date | None = Query(None),
    overdue_only:        bool       = Query(False),
    page:                int = Query(1, ge=1),
    page_size:           int = Query(50, ge=1, le=200),
    sort_by:             str | None = Query(None),
    sort_order:          str | None = Query("desc"),
):
    q = select(ProductionRecord)
    q = _apply_scope(q, user)

    if production_no:
        q = q.where(ProductionRecord.production_no.ilike(f"%{production_no}%"))
    if inquiry_no:
        q = q.where(ProductionRecord.inquiry_no.ilike(f"%{inquiry_no}%"))
    if customer_short_name:
        q = q.where(ProductionRecord.customer_short_name.ilike(f"%{customer_short_name}%"))
    if factory_name:
        q = q.where(ProductionRecord.factory_name.ilike(f"%{factory_name}%"))
    if product_category:
        q = q.where(ProductionRecord.product_category.ilike(f"%{product_category}%"))
    if product_name:
        q = q.where(ProductionRecord.product_name.ilike(f"%{product_name}%"))
    if production_status:
        q = q.where(ProductionRecord.production_status == production_status)
    if delay_risk_level:
        q = q.where(ProductionRecord.delay_risk_level == delay_risk_level)
    if responsible_sales:
        q = q.where(ProductionRecord.responsible_sales.ilike(f"%{responsible_sales}%"))
    if group_name:
        q = q.where(ProductionRecord.group_name.ilike(f"%{group_name}%"))
    if merchandiser:
        q = q.where(ProductionRecord.merchandiser.ilike(f"%{merchandiser}%"))
    if start_date:
        q = q.where(ProductionRecord.order_date >= start_date)
    if end_date:
        q = q.where(ProductionRecord.order_date <= end_date)
    if overdue_only:
        from sqlalchemy import func as sqlfunc
        today = date.today()
        q = q.where(
            ProductionRecord.delivery_date < today,
            ~ProductionRecord.production_status.in_(["completed", "shipped", "cancelled"]),
        )

    from sqlalchemy import func as sqlfunc
    count_q = select(sqlfunc.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    sort_col = {
        "delivery_date": ProductionRecord.delivery_date,
        "order_date":    ProductionRecord.order_date,
        "created_at":    ProductionRecord.created_at,
    }.get(sort_by or "", ProductionRecord.created_at)
    q = q.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)

    items = list((await db.execute(q)).scalars().all())
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [ProductionOut.model_validate(r).model_dump() for r in items],
    }


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/productions", response_model=ProductionOut, status_code=201)
async def create_production(body: ProductionCreate, db: DbDep, user: UserDep, request: Request):
    if user.role == "viewer":
        raise HTTPException(403, "只读角色不能创建生产跟单")

    data: dict[str, Any] = body.model_dump(exclude_none=True)

    if body.inquiry_id:
        inq = await db.get(Inquiry, body.inquiry_id)
        if not inq:
            raise HTTPException(404, "关联询单不存在")
        if not can_view_inquiry(inq, user):
            raise HTTPException(403, "无权访问该询单")
        data.setdefault("inquiry_no",          inq.inquiry_no)
        data.setdefault("customer_code",       inq.customer_code)
        data.setdefault("customer_short_name", inq.customer_short_name)
        data.setdefault("product_category",    inq.product_category)
        data.setdefault("product_name",        inq.product_name)
        data.setdefault("series_name",         inq.series_name)
        data.setdefault("responsible_sales",   inq.responsible_sales)
        data.setdefault("group_name",          inq.group_name)
        data.setdefault("order_quantity",      inq.order_quantity)
        data.setdefault("order_unit_price",    float(inq.order_unit_price) if inq.order_unit_price else None)
        data.setdefault("trade_amount",        float(inq.trade_amount) if inq.trade_amount else None)
        data.setdefault("order_date",          inq.order_date)

    if body.factory_id and "factory_name" not in data:
        fct = await db.get(Factory, body.factory_id)
        if fct:
            data["factory_name"] = fct.factory_name

    # Auto-fill responsible_sales/group_name from current user if not provided
    if user.role == "sales" and not data.get("responsible_sales"):
        data["responsible_sales"] = user.display_name or user.username
    if user.role in ("sales", "group_leader") and not data.get("group_name"):
        data["group_name"] = user.group_name

    if user.role == "group_leader" and data.get("group_name") and data["group_name"] != user.group_name:
        raise HTTPException(403, "组长只能在本组内创建生产跟单")

    production_no = await generate_production_no(db)
    rec = ProductionRecord(id=uuid.uuid4(), production_no=production_no, created_by=user.username, **data)
    db.add(rec)
    await db.flush()
    await db.refresh(rec)
    await db.commit()
    await db.refresh(rec)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="production_create",
        target_type="production",
        target_id=str(rec.id),
        inquiry_id=rec.inquiry_id,
        inquiry_no=rec.inquiry_no,
        description=f"创建生产跟单 {production_no}",
        after_data=production_snapshot(rec),
        request=request,
    )
    return rec


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/productions/{production_id}", response_model=ProductionOut)
async def get_production(production_id: uuid.UUID, db: DbDep, user: UserDep):
    rec = await db.get(ProductionRecord, production_id)
    if not rec:
        raise HTTPException(404, "生产跟单不存在")
    if user.role in ("group_leader", "viewer") and rec.group_name != user.group_name:
        raise HTTPException(403, "无权查看该生产跟单")
    if user.role == "sales":
        names = {user.username}
        if user.display_name:
            names.add(user.display_name)
        if rec.responsible_sales not in names:
            raise HTTPException(403, "无权查看该生产跟单")
    return rec


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/productions/{production_id}", response_model=ProductionOut)
async def update_production(
    production_id: uuid.UUID, body: ProductionUpdate, db: DbDep, user: UserDep, request: Request
):
    rec = await db.get(ProductionRecord, production_id)
    if not rec:
        raise HTTPException(404, "生产跟单不存在")
    if not _can_edit(user, rec):
        raise HTTPException(403, "无权编辑该生产跟单")

    before = production_snapshot(rec)
    old_status = rec.production_status

    update_data = body.model_dump(exclude_none=True)
    if "factory_id" in update_data and "factory_name" not in update_data:
        fct = await db.get(Factory, update_data["factory_id"])
        if fct:
            update_data["factory_name"] = fct.factory_name

    for field, val in update_data.items():
        setattr(rec, field, val)

    await db.flush()
    await db.refresh(rec)
    await db.commit()
    await db.refresh(rec)

    action_type = (
        "production_status_change"
        if "production_status" in update_data and old_status != rec.production_status
        else "production_update"
    )

    await safe_log(
        **log_kwargs_from_user(user),
        action_type=action_type,
        target_type="production",
        target_id=str(rec.id),
        inquiry_id=rec.inquiry_id,
        inquiry_no=rec.inquiry_no,
        description=f"编辑生产跟单 {rec.production_no}",
        before_data=before,
        after_data=production_snapshot(rec),
        request=request,
    )
    return rec


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/productions/{production_id}", status_code=204)
async def delete_production(production_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "只有管理员可以删除生产跟单")

    rec = await db.get(ProductionRecord, production_id)
    if not rec:
        raise HTTPException(404, "生产跟单不存在")

    snap = production_snapshot(rec)
    await db.delete(rec)
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="production_delete",
        target_type="production",
        target_id=str(production_id),
        inquiry_no=snap.get("production_no"),
        description=f"删除生产跟单 {snap.get('production_no')}",
        before_data=snap,
        request=request,
    )


# ── By inquiry ────────────────────────────────────────────────────────────────

@router.get("/inquiries/{inquiry_id}/productions", response_model=list[ProductionOut])
async def get_inquiry_productions(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(404, "询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(403, "无权查看该询单")

    q = (
        select(ProductionRecord)
        .where(ProductionRecord.inquiry_id == inquiry_id)
        .order_by(ProductionRecord.created_at.desc())
    )
    return list((await db.execute(q)).scalars().all())


# ── By factory ────────────────────────────────────────────────────────────────

@router.get("/factories/{factory_id}/productions", response_model=list[ProductionOut])
async def get_factory_productions(factory_id: uuid.UUID, db: DbDep, user: UserDep):
    q = select(ProductionRecord).where(ProductionRecord.factory_id == factory_id)
    q = _apply_scope(q, user)
    q = q.order_by(ProductionRecord.created_at.desc())
    return list((await db.execute(q)).scalars().all())


# ── By customer ───────────────────────────────────────────────────────────────

@router.get("/customers/{customer_code}/productions", response_model=list[ProductionOut])
async def get_customer_productions(customer_code: str, db: DbDep, user: UserDep):
    q = select(ProductionRecord).where(ProductionRecord.customer_code == customer_code)
    q = _apply_scope(q, user)
    q = q.order_by(ProductionRecord.created_at.desc())
    return list((await db.execute(q)).scalars().all())
