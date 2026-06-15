"""
工厂档案 & 工厂报价记录路由

权限规则：
  - 所有角色可查看工厂列表和详情
  - viewer 不能创建/编辑/删除
  - sales 可以创建工厂；可以编辑基础备注和标签；可以给自己可见询单创建报价记录；不能删除报价记录
  - group_leader/admin 可以完整 CRUD
  - admin 专属：删除报价记录
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_view_inquiry
from app.database import get_db
from app.models.factory import Factory
from app.models.factory_quote_record import FactoryQuoteRecord
from app.models.inquiry import Inquiry
from app.services.factory_service import (
    factory_snapshot,
    generate_factory_code,
    get_factory_list_stats,
    get_factory_stats,
    get_factory_summary,
    quote_record_snapshot,
)
from app.services.operation_log_service import log_kwargs_from_user, safe_log

DbDep = Annotated[AsyncSession, Depends(get_db)]

router = APIRouter(tags=["factories"])

# ── 权限帮助 ──────────────────────────────────────────────────────────────────

def _can_edit_factory(user) -> bool:
    return user.role != "viewer"


def _can_delete_quote_record(user) -> bool:
    return user.role in ("admin", "group_leader")


def _can_create_quote_record(user) -> bool:
    return user.role != "viewer"


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FactoryCreate(BaseModel):
    factory_name: str
    factory_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    address: str | None = None
    main_categories: list[str] | None = None
    capability_tags: list[str] | None = None
    certificate_tags: list[str] | None = None
    price_position: str | None = None
    moq: int | None = None
    normal_lead_time_days: int | None = None
    payment_terms: str | None = None
    cooperation_status: str | None = None
    risk_level: str | None = None
    risk_tags: list[str] | None = None
    remark: str | None = None


class FactoryUpdate(BaseModel):
    factory_name: str | None = None
    factory_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    contact_person: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    address: str | None = None
    main_categories: list[str] | None = None
    capability_tags: list[str] | None = None
    certificate_tags: list[str] | None = None
    price_position: str | None = None
    moq: int | None = None
    normal_lead_time_days: int | None = None
    payment_terms: str | None = None
    cooperation_status: str | None = None
    risk_level: str | None = None
    risk_tags: list[str] | None = None
    remark: str | None = None


class QuoteRecordCreate(BaseModel):
    factory_id: uuid.UUID
    inquiry_id: uuid.UUID | None = None
    inquiry_no: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    quantity: int | None = None
    factory_price: float | None = None
    quote_date: str | None = None  # YYYY-MM-DD
    quote_status: str | None = None
    order_status: str | None = None
    is_ordered: bool = False
    trade_amount: float | None = None
    remark: str | None = None


class QuoteRecordUpdate(BaseModel):
    inquiry_id: uuid.UUID | None = None
    inquiry_no: str | None = None
    product_category: str | None = None
    product_name: str | None = None
    series_name: str | None = None
    quantity: int | None = None
    factory_price: float | None = None
    quote_date: str | None = None
    quote_status: str | None = None
    order_status: str | None = None
    is_ordered: bool | None = None
    trade_amount: float | None = None
    remark: str | None = None


def _factory_to_dict(factory: Factory, stats: dict | None = None) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id":                   str(factory.id),
        "factory_code":         factory.factory_code,
        "factory_name":         factory.factory_name,
        "factory_short_name":   factory.factory_short_name,
        "country":              factory.country,
        "region":               factory.region,
        "contact_person":       factory.contact_person,
        "contact_phone":        factory.contact_phone,
        "contact_email":        factory.contact_email,
        "address":              factory.address,
        "main_categories":      factory.main_categories or [],
        "capability_tags":      factory.capability_tags or [],
        "certificate_tags":     factory.certificate_tags or [],
        "price_position":       factory.price_position,
        "moq":                  factory.moq,
        "normal_lead_time_days": factory.normal_lead_time_days,
        "payment_terms":        factory.payment_terms,
        "cooperation_status":   factory.cooperation_status,
        "risk_level":           factory.risk_level,
        "risk_tags":            factory.risk_tags or [],
        "remark":               factory.remark,
        "created_at":           factory.created_at.isoformat() if factory.created_at else None,
        "updated_at":           factory.updated_at.isoformat() if factory.updated_at else None,
    }
    if stats is not None:
        d.update(stats)
    return d


def _qr_to_dict(r: FactoryQuoteRecord) -> dict[str, Any]:
    return {
        "id":               str(r.id),
        "factory_id":       str(r.factory_id),
        "factory_name":     r.factory_name,
        "inquiry_id":       str(r.inquiry_id) if r.inquiry_id else None,
        "inquiry_no":       r.inquiry_no,
        "product_category": r.product_category,
        "product_name":     r.product_name,
        "series_name":      r.series_name,
        "quantity":         r.quantity,
        "factory_price":    float(r.factory_price) if r.factory_price else None,
        "quote_date":       r.quote_date.isoformat() if r.quote_date else None,
        "quote_status":     r.quote_status,
        "order_status":     r.order_status,
        "is_ordered":       r.is_ordered,
        "trade_amount":     float(r.trade_amount) if r.trade_amount else None,
        "remark":           r.remark,
        "created_by":       r.created_by,
        "created_at":       r.created_at.isoformat() if r.created_at else None,
        "updated_at":       r.updated_at.isoformat() if r.updated_at else None,
    }


# ── 工厂列表 ──────────────────────────────────────────────────────────────────

@router.get("/factories/summary")
async def get_summary(db: DbDep, user: UserDep):
    return await get_factory_summary(db)


@router.get("/factories")
async def list_factories(
    db: DbDep,
    user: UserDep,
    factory_name: str | None = Query(None),
    factory_short_name: str | None = Query(None),
    country: str | None = Query(None),
    region: str | None = Query(None),
    main_category: str | None = Query(None),
    capability_tag: str | None = Query(None),
    certificate_tag: str | None = Query(None),
    price_position: str | None = Query(None),
    cooperation_status: str | None = Query(None),
    risk_level: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("factory_code"),
    sort_order: str = Query("asc"),
):
    q = select(Factory)
    if factory_name:
        q = q.where(or_(
            Factory.factory_name.ilike(f"%{factory_name}%"),
            Factory.factory_short_name.ilike(f"%{factory_name}%"),
        ))
    if factory_short_name:
        q = q.where(Factory.factory_short_name.ilike(f"%{factory_short_name}%"))
    if country:
        q = q.where(Factory.country.ilike(f"%{country}%"))
    if region:
        q = q.where(Factory.region.ilike(f"%{region}%"))
    if price_position:
        q = q.where(Factory.price_position == price_position)
    if cooperation_status:
        q = q.where(Factory.cooperation_status == cooperation_status)
    if risk_level:
        q = q.where(Factory.risk_level == risk_level)
    if main_category:
        q = q.where(Factory.main_categories.contains([main_category]))
    if capability_tag:
        q = q.where(Factory.capability_tags.contains([capability_tag]))
    if certificate_tag:
        q = q.where(Factory.certificate_tags.contains([certificate_tag]))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    sort_col = getattr(Factory, sort_by, Factory.factory_code)
    if sort_order == "desc":
        q = q.order_by(sort_col.desc())
    else:
        q = q.order_by(sort_col.asc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    factory_ids = [f.id for f in rows]
    stats_map = await get_factory_list_stats(db, factory_ids)

    items = [_factory_to_dict(f, stats_map.get(str(f.id), {
        "quote_count": 0, "ordered_count": 0,
        "order_conversion_rate": None, "total_trade_amount": None,
    })) for f in rows]

    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── 创建工厂 ──────────────────────────────────────────────────────────────────

@router.post("/factories", status_code=201)
async def create_factory(body: FactoryCreate, db: DbDep, user: UserDep, request: Request):
    if not _can_edit_factory(user):
        raise HTTPException(status_code=403, detail="无权创建工厂")

    code = await generate_factory_code(db)
    factory = Factory(
        id=uuid.uuid4(),
        factory_code=code,
        **body.model_dump(exclude_none=True),
    )
    db.add(factory)
    await db.flush()
    await db.refresh(factory)
    await db.commit()
    await db.refresh(factory)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_create",
        target_type="factory",
        target_id=str(factory.id),
        description=f"创建工厂：{factory.factory_name or factory.factory_code}",
        after_data=factory_snapshot(factory),
        request=request,
    )
    return _factory_to_dict(factory)


# ── 工厂详情 ──────────────────────────────────────────────────────────────────

@router.get("/factories/{factory_id}")
async def get_factory(factory_id: uuid.UUID, db: DbDep, user: UserDep):
    factory = await db.get(Factory, factory_id)
    if not factory:
        raise HTTPException(status_code=404, detail="工厂不存在")
    stats = await get_factory_stats(db, factory_id)
    result = _factory_to_dict(factory, stats)
    return result


# ── 更新工厂 ──────────────────────────────────────────────────────────────────

@router.patch("/factories/{factory_id}")
async def update_factory(
    factory_id: uuid.UUID, body: FactoryUpdate,
    db: DbDep, user: UserDep, request: Request,
):
    factory = await db.get(Factory, factory_id)
    if not factory:
        raise HTTPException(status_code=404, detail="工厂不存在")
    if not _can_edit_factory(user):
        raise HTTPException(status_code=403, detail="无权编辑工厂")

    before = factory_snapshot(factory)
    data = body.model_dump(exclude_unset=True)

    # sales 只能修改备注和标签
    if user.role == "sales":
        allowed_sales_fields = {"remark", "capability_tags", "risk_tags", "certificate_tags", "main_categories"}
        data = {k: v for k, v in data.items() if k in allowed_sales_fields}

    for k, v in data.items():
        setattr(factory, k, v)
    await db.flush()
    await db.refresh(factory)
    await db.commit()
    await db.refresh(factory)

    after = factory_snapshot(factory)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_update",
        target_type="factory",
        target_id=str(factory.id),
        description=f"编辑工厂：{factory.factory_name or factory.factory_code}",
        before_data=before,
        after_data=after,
        request=request,
    )
    stats = await get_factory_stats(db, factory_id)
    return _factory_to_dict(factory, stats)


# ── 工厂报价记录列表（按工厂） ────────────────────────────────────────────────

@router.get("/factories/{factory_id}/quote-records")
async def list_factory_quote_records(
    factory_id: uuid.UUID,
    db: DbDep,
    user: UserDep,
    inquiry_no: str | None = Query(None),
    product_category: str | None = Query(None),
    product_name: str | None = Query(None),
    series_name: str | None = Query(None),
    quote_status: str | None = Query(None),
    order_status: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    factory = await db.get(Factory, factory_id)
    if not factory:
        raise HTTPException(status_code=404, detail="工厂不存在")

    q = select(FactoryQuoteRecord).where(FactoryQuoteRecord.factory_id == factory_id)
    if inquiry_no:
        q = q.where(FactoryQuoteRecord.inquiry_no.ilike(f"%{inquiry_no}%"))
    if product_category:
        q = q.where(FactoryQuoteRecord.product_category.ilike(f"%{product_category}%"))
    if product_name:
        q = q.where(FactoryQuoteRecord.product_name.ilike(f"%{product_name}%"))
    if series_name:
        q = q.where(FactoryQuoteRecord.series_name.ilike(f"%{series_name}%"))
    if quote_status:
        q = q.where(FactoryQuoteRecord.quote_status == quote_status)
    if order_status:
        q = q.where(FactoryQuoteRecord.order_status == order_status)
    if start_date:
        from datetime import date
        q = q.where(FactoryQuoteRecord.quote_date >= date.fromisoformat(start_date))
    if end_date:
        from datetime import date
        q = q.where(FactoryQuoteRecord.quote_date <= date.fromisoformat(end_date))

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.order_by(FactoryQuoteRecord.quote_date.desc().nullslast(), FactoryQuoteRecord.created_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_qr_to_dict(r) for r in rows],
    }


# ── 询单关联的报价记录 ────────────────────────────────────────────────────────

@router.get("/inquiries/{inquiry_id}/factory-quote-records")
async def list_inquiry_quote_records(
    inquiry_id: uuid.UUID,
    db: DbDep,
    user: UserDep,
):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")

    q = (
        select(FactoryQuoteRecord)
        .where(FactoryQuoteRecord.inquiry_id == inquiry_id)
        .order_by(FactoryQuoteRecord.quote_date.desc().nullslast(), FactoryQuoteRecord.created_at.desc())
    )
    rows = (await db.execute(q)).scalars().all()

    # 补充工厂名称
    result = []
    for r in rows:
        d = _qr_to_dict(r)
        if not d["factory_name"] and r.factory_id:
            f = await db.get(Factory, r.factory_id)
            if f:
                d["factory_name"] = f.factory_short_name or f.factory_name
        result.append(d)
    return result


# ── 创建报价记录 ──────────────────────────────────────────────────────────────

@router.post("/factory-quote-records", status_code=201)
async def create_quote_record(body: QuoteRecordCreate, db: DbDep, user: UserDep, request: Request):
    if not _can_create_quote_record(user):
        raise HTTPException(status_code=403, detail="无权创建工厂报价记录")

    factory = await db.get(Factory, body.factory_id)
    if not factory:
        raise HTTPException(status_code=404, detail="工厂不存在")

    # 如果指定了 inquiry_id，检查权限
    if body.inquiry_id:
        inq = await db.get(Inquiry, body.inquiry_id)
        if not inq:
            raise HTTPException(status_code=404, detail="询单不存在")
        if not can_view_inquiry(inq, user):
            raise HTTPException(status_code=403, detail="无权访问该询单")

    data = body.model_dump(exclude_none=True)
    # 转换 quote_date
    if "quote_date" in data and isinstance(data["quote_date"], str):
        from datetime import date
        try:
            data["quote_date"] = date.fromisoformat(data["quote_date"])
        except ValueError:
            data.pop("quote_date")

    record = FactoryQuoteRecord(
        id=uuid.uuid4(),
        factory_name=factory.factory_short_name or factory.factory_name,
        created_by=user.username,
        **data,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    await db.commit()
    await db.refresh(record)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_create",
        target_type="factory",
        target_id=str(factory.id),
        inquiry_id=body.inquiry_id,
        inquiry_no=body.inquiry_no,
        description=f"创建工厂报价记录：{factory.factory_short_name or factory.factory_name}",
        after_data=quote_record_snapshot(record),
        request=request,
    )
    return _qr_to_dict(record)


# ── 更新报价记录 ──────────────────────────────────────────────────────────────

@router.patch("/factory-quote-records/{record_id}")
async def update_quote_record(
    record_id: uuid.UUID, body: QuoteRecordUpdate,
    db: DbDep, user: UserDep, request: Request,
):
    if not _can_create_quote_record(user):
        raise HTTPException(status_code=403, detail="无权编辑工厂报价记录")

    record = await db.get(FactoryQuoteRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="报价记录不存在")

    # sales 只能编辑自己创建的记录
    if user.role == "sales" and record.created_by != user.username:
        raise HTTPException(status_code=403, detail="只能编辑自己创建的记录")

    before = quote_record_snapshot(record)
    data = body.model_dump(exclude_unset=True)
    if "quote_date" in data and isinstance(data["quote_date"], str):
        from datetime import date
        try:
            data["quote_date"] = date.fromisoformat(data["quote_date"])
        except ValueError:
            data.pop("quote_date")

    for k, v in data.items():
        setattr(record, k, v)
    await db.flush()
    await db.refresh(record)
    await db.commit()
    await db.refresh(record)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_update",
        target_type="factory",
        target_id=str(record.factory_id),
        inquiry_id=record.inquiry_id,
        inquiry_no=record.inquiry_no,
        description="编辑工厂报价记录",
        before_data=before,
        after_data=quote_record_snapshot(record),
        request=request,
    )
    return _qr_to_dict(record)


# ── 删除报价记录 ──────────────────────────────────────────────────────────────

@router.delete("/factory-quote-records/{record_id}", status_code=204)
async def delete_quote_record(
    record_id: uuid.UUID, db: DbDep, user: UserDep, request: Request,
):
    if not _can_delete_quote_record(user):
        raise HTTPException(status_code=403, detail="无权删除工厂报价记录")

    record = await db.get(FactoryQuoteRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="报价记录不存在")

    before = quote_record_snapshot(record)
    factory_id_str = str(record.factory_id)
    inquiry_id = record.inquiry_id
    inquiry_no = record.inquiry_no

    await db.delete(record)
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_delete",
        target_type="factory",
        target_id=factory_id_str,
        inquiry_id=inquiry_id,
        inquiry_no=inquiry_no,
        description="删除工厂报价记录",
        before_data=before,
        request=request,
    )
