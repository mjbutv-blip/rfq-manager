"""
客户档案服务 — 统计聚合 + 权限范围辅助

统计数据从 inquiries 表实时聚合，不写入 customers 表，
避免数据不一致问题。
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Inquiry
from app.models.customer import Customer

# 算作"已下单"的订单状态
_ORDER_STATUSES = ("下单", "已下单", "确认转单")
_ACTIVE_DAYS = 90
_INACTIVE_DAYS = 180


# ── 权限范围 ─────────────────────────────────────────────────────────────────

def customer_visible_codes(user) -> Any | None:
    """返回当前用户可见 customer_code 的子查询；admin 返回 None（不限）。"""
    if user.role == "admin":
        return None
    q = select(Inquiry.customer_code.distinct()).where(Inquiry.customer_code.isnot(None))
    if user.role in ("group_leader", "viewer"):
        q = q.where(Inquiry.group_name == user.group_name)
    elif user.role == "sales":
        names = [user.username]
        if user.display_name:
            names.append(user.display_name)
        q = q.where(
            or_(
                Inquiry.responsible_sales.in_(names),
                Inquiry.assisting_sales.in_(names),
            )
        )
    else:
        q = q.where(Inquiry.id.is_(None))
    return q


def can_edit_customer(customer: Customer, user) -> bool:
    """viewer 不可编辑；其他角色需在可见范围内。"""
    if user.role == "viewer":
        return False
    if user.role == "admin":
        return True
    if user.role == "group_leader":
        return customer.group_name == user.group_name
    if user.role == "sales":
        names = {user.username}
        if user.display_name:
            names.add(user.display_name)
        return (customer.responsible_sales or "") in names
    return False


# ── 单客户统计 ────────────────────────────────────────────────────────────────

async def get_customer_stats(db: AsyncSession, customer_code: str) -> dict:
    """聚合单个客户的全量统计。"""
    q = select(Inquiry).where(Inquiry.customer_code == customer_code)
    rows = list((await db.execute(q)).scalars().all())

    if not rows:
        return _empty_stats()

    total_inq = len(rows)
    order_rows = [r for r in rows if r.order_status in _ORDER_STATUSES]
    total_ord = len(order_rows)
    conversion_rate = round(total_ord / total_inq * 100, 1) if total_inq else None

    trade_amounts = [float(r.trade_amount) for r in order_rows if r.trade_amount is not None]
    total_trade = round(sum(trade_amounts), 2) if trade_amounts else None
    avg_order = round(sum(trade_amounts) / len(trade_amounts), 2) if trade_amounts else None

    inq_dates  = [r.inquiry_date for r in rows if r.inquiry_date]
    ord_dates  = [r.order_date   for r in order_rows if r.order_date]
    last_inq_d = max(inq_dates).isoformat() if inq_dates else None
    last_ord_d = max(ord_dates).isoformat() if ord_dates else None

    today = date.today()
    active_cutoff   = today - timedelta(days=_ACTIVE_DAYS)
    inactive_cutoff = today - timedelta(days=_INACTIVE_DAYS)
    recent_dates = [d for d in inq_dates + ord_dates if d >= active_cutoff]
    oldest_date  = max(inq_dates + ord_dates) if (inq_dates + ord_dates) else None
    is_active    = bool(recent_dates)
    is_inactive  = (oldest_date is not None and oldest_date < inactive_cutoff)

    # Top categories
    cat_counts: dict[str, int] = {}
    for r in rows:
        if r.product_category:
            cat_counts[r.product_category] = cat_counts.get(r.product_category, 0) + 1
    top_categories = [
        {"name": k, "count": v}
        for k, v in sorted(cat_counts.items(), key=lambda x: -x[1])[:3]
    ]

    # Top series
    ser_counts: dict[str, int] = {}
    for r in rows:
        if r.series_name:
            ser_counts[r.series_name] = ser_counts.get(r.series_name, 0) + 1
    top_series = [
        {"name": k, "count": v}
        for k, v in sorted(ser_counts.items(), key=lambda x: -x[1])[:3]
    ]

    # Primary inquiry months
    inq_months: dict[str, int] = {}
    for r in rows:
        if r.inquiry_month:
            inq_months[r.inquiry_month] = inq_months.get(r.inquiry_month, 0) + 1
    primary_inq_months = [
        {"month": k, "count": v}
        for k, v in sorted(inq_months.items(), key=lambda x: -x[1])[:3]
    ]

    # Primary order months
    ord_months: dict[str, int] = {}
    for r in order_rows:
        if r.order_date:
            m = r.order_date.strftime("%b")
            ord_months[m] = ord_months.get(m, 0) + 1
    primary_ord_months = [
        {"month": k, "count": v}
        for k, v in sorted(ord_months.items(), key=lambda x: -x[1])[:3]
    ]

    # Primary seasons
    seasons: dict[str, int] = {}
    for r in rows:
        if r.season:
            seasons[r.season] = seasons.get(r.season, 0) + 1
    primary_seasons = [
        {"season": k, "count": v}
        for k, v in sorted(seasons.items(), key=lambda x: -x[1])[:3]
    ]

    # Avg days from inquiry to order
    day_diffs = []
    for r in order_rows:
        if r.inquiry_date and r.order_date and r.order_date >= r.inquiry_date:
            day_diffs.append((r.order_date - r.inquiry_date).days)
    avg_days_to_order = round(sum(day_diffs) / len(day_diffs), 1) if day_diffs else None

    return {
        "total_inquiry_count": total_inq,
        "total_order_count": total_ord,
        "conversion_rate": conversion_rate,
        "total_trade_amount": total_trade,
        "avg_order_amount": avg_order,
        "last_inquiry_date": last_inq_d,
        "last_order_date": last_ord_d,
        "is_active": is_active,
        "is_inactive": is_inactive,
        "top_categories": top_categories,
        "top_series": top_series,
        "primary_inquiry_months": primary_inq_months,
        "primary_order_months": primary_ord_months,
        "primary_seasons": primary_seasons,
        "avg_days_to_order": avg_days_to_order,
    }


def _empty_stats() -> dict:
    return {
        "total_inquiry_count": 0,
        "total_order_count": 0,
        "conversion_rate": None,
        "total_trade_amount": None,
        "avg_order_amount": None,
        "last_inquiry_date": None,
        "last_order_date": None,
        "is_active": False,
        "is_inactive": True,
        "top_categories": [],
        "top_series": [],
        "primary_inquiry_months": [],
        "primary_order_months": [],
        "primary_seasons": [],
        "avg_days_to_order": None,
    }


# ── 批量轻量统计（供客户列表）─────────────────────────────────────────────────

async def get_customer_list_stats(
    db: AsyncSession,
    customer_codes: list[str],
) -> dict[str, dict]:
    """
    一次性批量聚合多个客户的轻量统计（总询单/下单/贸易额/最近日期）。
    返回 {customer_code: stats_dict}。
    """
    if not customer_codes:
        return {}

    today = date.today()
    active_cutoff = today - timedelta(days=_ACTIVE_DAYS)

    order_case = case(
        (Inquiry.order_status.in_(list(_ORDER_STATUSES)), 1),
        else_=None,
    )
    active_inq_case = case(
        (Inquiry.inquiry_date >= active_cutoff, 1),
        else_=None,
    )
    active_ord_case = case(
        (Inquiry.order_date >= active_cutoff, 1),
        else_=None,
    )

    q = (
        select(
            Inquiry.customer_code,
            func.count().label("total_inquiry_count"),
            func.count(order_case).label("total_order_count"),
            func.sum(Inquiry.trade_amount).label("total_trade_amount"),
            func.max(Inquiry.inquiry_date).label("last_inquiry_date"),
            func.max(Inquiry.order_date).label("last_order_date"),
            func.count(active_inq_case).label("active_inq_cnt"),
            func.count(active_ord_case).label("active_ord_cnt"),
        )
        .where(Inquiry.customer_code.in_(customer_codes))
        .group_by(Inquiry.customer_code)
    )

    rows = (await db.execute(q)).all()
    result: dict[str, dict] = {}
    for r in rows:
        total_inq = r.total_inquiry_count or 0
        total_ord = r.total_order_count or 0
        conv = round(total_ord / total_inq * 100, 1) if total_inq else None
        trade = float(r.total_trade_amount) if r.total_trade_amount is not None else None
        result[r.customer_code] = {
            "total_inquiry_count": total_inq,
            "total_order_count": total_ord,
            "conversion_rate": conv,
            "total_trade_amount": trade,
            "last_inquiry_date": r.last_inquiry_date.isoformat() if r.last_inquiry_date else None,
            "last_order_date": r.last_order_date.isoformat() if r.last_order_date else None,
            "is_active": (r.active_inq_cnt or 0) + (r.active_ord_cnt or 0) > 0,
        }
    return result
