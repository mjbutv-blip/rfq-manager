import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_view_inquiry
from app.database import get_db
from app.models import Inquiry
from app.models.customer import Customer
from app.schemas.inquiry import InquiryListItem
from app.services.customer_service import (
    can_edit_customer,
    customer_visible_codes,
    get_customer_list_stats,
    get_customer_stats,
)
from app.services.operation_log_service import log_kwargs_from_user, safe_log, snapshot

router = APIRouter(prefix="/customers", tags=["customers"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


# ── Schemas ───────────────────────────────────────────────────────────────────

class CustomerOut(BaseModel):
    customer_code: str
    customer_name: str | None
    customer_short_name: str | None
    country: str | None
    region: str | None
    customer_category: str | None
    group_name: str | None
    responsible_sales: str | None
    customer_level: str | None
    customer_tags: list | None
    payment_terms: str | None
    price_preference: str | None
    follow_up_note: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, c: Customer) -> "CustomerOut":
        return cls(
            customer_code=c.customer_code,
            customer_name=c.customer_name,
            customer_short_name=c.customer_short_name,
            country=c.country,
            region=c.region,
            customer_category=c.customer_category,
            group_name=c.group_name,
            responsible_sales=c.responsible_sales,
            customer_level=c.customer_level,
            customer_tags=c.customer_tags or [],
            payment_terms=c.payment_terms,
            price_preference=c.price_preference,
            follow_up_note=c.follow_up_note,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        )


class CustomerUpdate(BaseModel):
    customer_category: str | None = None
    customer_level: str | None = None
    customer_tags: list[str] | None = None
    payment_terms: str | None = None
    price_preference: str | None = None
    follow_up_note: str | None = None


# ── 列表 ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_customers(
    db: DbDep,
    user: UserDep,
    customer_code:       str | None = Query(None),
    customer_short_name: str | None = Query(None),
    country:             str | None = Query(None),
    region:              str | None = Query(None),
    customer_category:   str | None = Query(None),
    group_name:          str | None = Query(None),
    responsible_sales:   str | None = Query(None),
    customer_level:      str | None = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by:    str | None = Query(None, description="customer_code|total_inquiry_count|total_trade_amount|last_inquiry_date"),
    sort_order: str | None = Query("desc"),
):
    q = select(Customer)

    # 权限范围
    visible = customer_visible_codes(user)
    if visible is not None:
        q = q.where(Customer.customer_code.in_(visible))

    # 筛选
    if customer_code:
        q = q.where(Customer.customer_code.ilike(f"%{customer_code}%"))
    if customer_short_name:
        q = q.where(Customer.customer_short_name.ilike(f"%{customer_short_name}%"))
    if country:
        q = q.where(Customer.country.ilike(f"%{country}%"))
    if region:
        q = q.where(Customer.region.ilike(f"%{region}%"))
    if customer_category:
        q = q.where(Customer.customer_category == customer_category)
    if group_name:
        q = q.where(Customer.group_name.ilike(f"%{group_name}%"))
    if responsible_sales:
        q = q.where(Customer.responsible_sales.ilike(f"%{responsible_sales}%"))
    if customer_level:
        q = q.where(Customer.customer_level == customer_level)

    # 计数
    from sqlalchemy import func
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()

    # 排序（默认 customer_code，统计排序后处理）
    q = q.order_by(Customer.customer_code)
    q = q.offset((page - 1) * page_size).limit(page_size)
    customers = list((await db.execute(q)).scalars().all())

    # 批量拉统计
    codes = [c.customer_code for c in customers]
    stats_map = await get_customer_list_stats(db, codes)

    items = []
    for c in customers:
        st = stats_map.get(c.customer_code, {})
        row = CustomerOut.from_orm(c).model_dump()
        row.update(st)
        items.append(row)

    # 统计排序（内存排序，page_size 范围内）
    if sort_by in ("total_inquiry_count", "total_trade_amount", "last_inquiry_date"):
        reverse = sort_order != "asc"
        items.sort(key=lambda x: (x.get(sort_by) or 0), reverse=reverse)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── 汇总摘要（顶部统计卡片）─────────────────────────────────────────────────

@router.get("/summary", response_model=dict)
async def customer_summary(db: DbDep, user: UserDep):
    """返回客户列表顶部统计卡片数据。"""
    from datetime import date, timedelta
    from sqlalchemy import case, func

    visible = customer_visible_codes(user)

    # 总客户数
    cq = select(func.count()).select_from(Customer)
    if visible is not None:
        cq = cq.where(Customer.customer_code.in_(visible))
    total_customers = (await db.execute(cq)).scalar_one()

    # 从 inquiries 聚合贸易额 + 活跃 + 有下单
    today = date.today()
    active_cutoff = today - timedelta(days=90)

    iq = select(
        Inquiry.customer_code,
        func.sum(Inquiry.trade_amount).label("trade"),
        func.max(Inquiry.inquiry_date).label("last_inq"),
        func.max(Inquiry.order_date).label("last_ord"),
        func.count(
            case((Inquiry.order_status.in_(["下单", "已下单", "确认转单"]), 1), else_=None)
        ).label("ord_cnt"),
    ).where(Inquiry.customer_code.isnot(None)).group_by(Inquiry.customer_code)

    if visible is not None:
        iq = iq.where(Inquiry.customer_code.in_(visible))

    agg_rows = (await db.execute(iq)).all()

    active_count = 0
    with_order_count = 0
    total_trade = 0.0

    for r in agg_rows:
        last = None
        if r.last_inq:
            last = r.last_inq
        if r.last_ord and (last is None or r.last_ord > last):
            last = r.last_ord
        if last and last >= active_cutoff:
            active_count += 1
        if (r.ord_cnt or 0) > 0:
            with_order_count += 1
        if r.trade:
            total_trade += float(r.trade)

    return {
        "total_customers": total_customers,
        "active_customers": active_count,
        "customers_with_orders": with_order_count,
        "total_trade_amount": round(total_trade, 2),
    }


# ── 按简称查询（客户代码为空时的备用入口） ──────────────────────────────────

@router.get("/by-name/{customer_short_name}", response_model=dict)
async def get_customer_by_name(
    customer_short_name: str,
    db: DbDep,
    user: UserDep,
):
    """按客户简称查询。若 customers 表无记录，则从 inquiries 动态构造摘要。"""
    visible = customer_visible_codes(user)

    # 先查 customers 表
    q = select(Customer).where(Customer.customer_short_name == customer_short_name)
    if visible is not None:
        q = q.where(Customer.customer_code.in_(visible))
    customer = (await db.execute(q)).scalar_one_or_none()

    if customer:
        stats = await get_customer_stats(db, customer.customer_code)
        result = CustomerOut.from_orm(customer).model_dump()
        result["stats"] = stats
        return result

    # 从 inquiries 动态构造（无 customers 表记录的情况）
    iq = select(Inquiry).where(Inquiry.customer_short_name == customer_short_name)
    if visible is not None:
        iq = iq.where(Inquiry.customer_code.in_(visible))
    inqs = list((await db.execute(iq)).scalars().all())

    if not inqs:
        raise HTTPException(404, f"客户 '{customer_short_name}' 不存在或无权访问")

    first = inqs[0]
    return {
        "customer_code": first.customer_code or "",
        "customer_name": first.customer_name,
        "customer_short_name": first.customer_short_name,
        "country": first.country,
        "region": first.region,
        "customer_category": first.customer_category,
        "group_name": first.group_name,
        "responsible_sales": first.responsible_sales,
        "customer_level": None,
        "customer_tags": [],
        "payment_terms": None,
        "price_preference": None,
        "follow_up_note": None,
        "created_at": None,
        "updated_at": None,
        "stats": None,
    }


# ── 客户详情 ──────────────────────────────────────────────────────────────────

@router.get("/{customer_code}", response_model=dict)
async def get_customer(customer_code: str, db: DbDep, user: UserDep):
    visible = customer_visible_codes(user)

    q = select(Customer).where(Customer.customer_code == customer_code)
    if visible is not None:
        q = q.where(Customer.customer_code.in_(visible))
    customer = (await db.execute(q)).scalar_one_or_none()

    if not customer:
        raise HTTPException(404, "客户不存在或无权访问")

    stats = await get_customer_stats(db, customer_code)
    result = CustomerOut.from_orm(customer).model_dump()
    result["stats"] = stats
    return result


# ── 客户询单历史 ──────────────────────────────────────────────────────────────

@router.get("/{customer_code}/inquiries", response_model=dict)
async def get_customer_inquiries(
    customer_code: str,
    db: DbDep,
    user: UserDep,
    year:             int | None = Query(None),
    month:            str | None = Query(None),
    product_category: str | None = Query(None),
    series_name:      str | None = Query(None),
    order_status:     str | None = Query(None),
    quote_status:     str | None = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    from app.core.permissions import apply_inquiry_scope

    q = select(Inquiry).where(Inquiry.customer_code == customer_code)
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if month:
        q = q.where(Inquiry.inquiry_month == month)
    if product_category:
        q = q.where(Inquiry.product_category == product_category)
    if series_name:
        q = q.where(Inquiry.series_name.ilike(f"%{series_name}%"))
    if order_status:
        q = q.where(Inquiry.order_status == order_status)
    if quote_status:
        q = q.where(Inquiry.quote_status == quote_status)

    from sqlalchemy import func
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    q = q.order_by(Inquiry.inquiry_date.desc().nullslast()).offset((page - 1) * page_size).limit(page_size)
    inqs = list((await db.execute(q)).scalars().all())

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [InquiryListItem.model_validate(i).model_dump() for i in inqs],
    }


# ── 更新客户档案 ──────────────────────────────────────────────────────────────

@router.patch("/{customer_code}", response_model=dict)
async def update_customer(
    customer_code: str,
    body: CustomerUpdate,
    db: DbDep,
    user: UserDep,
    request: Request,
):
    visible = customer_visible_codes(user)
    q = select(Customer).where(Customer.customer_code == customer_code)
    if visible is not None:
        q = q.where(Customer.customer_code.in_(visible))
    customer = (await db.execute(q)).scalar_one_or_none()

    if not customer:
        raise HTTPException(404, "客户不存在或无权访问")
    if not can_edit_customer(customer, user):
        raise HTTPException(403, "无权编辑该客户档案")

    before = {
        "customer_level": customer.customer_level,
        "customer_tags": customer.customer_tags,
        "payment_terms": customer.payment_terms,
        "price_preference": customer.price_preference,
        "follow_up_note": customer.follow_up_note,
        "customer_category": customer.customer_category,
    }

    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(customer, k, v)

    await db.commit()
    await db.refresh(customer)

    after = {
        "customer_level": customer.customer_level,
        "customer_tags": customer.customer_tags,
        "payment_terms": customer.payment_terms,
        "price_preference": customer.price_preference,
        "follow_up_note": customer.follow_up_note,
        "customer_category": customer.customer_category,
    }

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="customer_update",
        target_type="inquiry",
        target_id=str(customer.id),
        description=f"更新客户档案 {customer_code}",
        before_data=before,
        after_data=after,
        request=request,
    )

    result = CustomerOut.from_orm(customer).model_dump()
    result["stats"] = await get_customer_stats(db, customer_code)
    return result
