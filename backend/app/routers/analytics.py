"""
数据分析接口
所有接口均支持可选的 year 参数；Python 层聚合，适合 MVP 数据量。
所有接口均根据当前用户角色限定数据范围。
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, apply_inquiry_scope
from app.database import get_db
from app.models import Inquiry, User
from app.schemas.analytics import (
    CustomerStat,
    DashboardStats,
    GroupStat,
    ProductStat,
    QuarterStat,
    SalesStat,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

MONTH_TO_QUARTER = {
    "Jan": 1, "Feb": 1, "Mar": 1,
    "Apr": 2, "May": 2, "Jun": 2,
    "Jul": 3, "Aug": 3, "Sep": 3,
    "Oct": 4, "Nov": 4, "Dec": 4,
}


async def _load(db: AsyncSession, year: int | None, user: User) -> list[Inquiry]:
    q = select(Inquiry)
    if year:
        q = q.where(Inquiry.inquiry_year == year)
    q = apply_inquiry_scope(q, user)
    return list((await db.execute(q)).scalars().all())


def _pct(ordered: int, total: int) -> float:
    return round(ordered / total * 100, 1) if total else 0.0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """首页核心指标"""
    rows = await _load(db, year, user)
    total = len(rows)
    quoted = sum(
        1 for r in rows
        if r.quote_status and r.quote_status not in ("未报价", "")
    )
    ordered = sum(1 for r in rows if r.order_status == "下单")
    trade = sum(float(r.trade_amount or 0) for r in rows if r.order_status == "下单")
    gp_vals = [float(r.gross_profit_rate) for r in rows if r.gross_profit_rate is not None]

    return DashboardStats(
        total_inquiries=total,
        total_quoted=quoted,
        total_ordered=ordered,
        conversion_rate=_pct(ordered, total),
        total_trade_amount=trade,
        avg_gross_profit_rate=_avg(gp_vals),
    )


# ── 业务员分析 ─────────────────────────────────────────────────────────────────

@router.get("/sales", response_model=list[SalesStat])
async def sales_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按负责业务员汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0, order_trades=[], gp=[])
    )
    for r in rows:
        key = r.responsible_sales or "未知"
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            amt = float(r.trade_amount or 0)
            s["trade"] += amt
            if r.trade_amount:
                s["order_trades"].append(amt)
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    result = []
    for name, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"]):
        result.append(SalesStat(
            responsible_sales=name,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_trade_amount=round(s["trade"] / s["ordered"], 2) if s["ordered"] else 0.0,
            avg_gross_profit_rate=_avg(s["gp"]),
        ))
    return result


# ── 客户分析 ──────────────────────────────────────────────────────────────────

@router.get("/customers", response_model=list[CustomerStat])
async def customers_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按客户（customer_short_name 或 customer_code）汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(lambda: dict(
        customer_code=None,
        customer_short_name=None,
        inquiry=0, ordered=0,
        trade=0.0, order_trades=[],
        inquiry_dates=[], order_dates=[],
        ordered_cats=[], ordered_series=[],
    ))

    for r in rows:
        key = r.customer_short_name or r.customer_code or "未知"
        s = stats[key]
        s["customer_code"] = s["customer_code"] or r.customer_code
        s["customer_short_name"] = s["customer_short_name"] or r.customer_short_name
        s["inquiry"] += 1
        if r.inquiry_date:
            s["inquiry_dates"].append(r.inquiry_date)
        if r.order_status == "下单":
            s["ordered"] += 1
            amt = float(r.trade_amount or 0)
            s["trade"] += amt
            if r.trade_amount:
                s["order_trades"].append(amt)
            if r.order_date:
                s["order_dates"].append(r.order_date)
            if r.product_category:
                s["ordered_cats"].append(r.product_category)
            if r.series_name:
                s["ordered_series"].append(r.series_name)

    result = []
    for _key, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"]):
        top_cat = Counter(s["ordered_cats"]).most_common(1)
        top_ser = Counter(s["ordered_series"]).most_common(1)
        result.append(CustomerStat(
            customer_code=s["customer_code"],
            customer_short_name=s["customer_short_name"] or _key,
            inquiry_count=s["inquiry"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_order_amount=round(s["trade"] / s["ordered"], 2) if s["ordered"] else 0.0,
            last_inquiry_date=max(s["inquiry_dates"]) if s["inquiry_dates"] else None,
            last_order_date=max(s["order_dates"]) if s["order_dates"] else None,
            top_product_category=top_cat[0][0] if top_cat else None,
            top_series=top_ser[0][0] if top_ser else None,
        ))
    return result


# ── 小组分析 ──────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[GroupStat])
async def groups_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按业务小组汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0, gp=[])
    )
    for r in rows:
        key = r.group_name or "未知"
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    return [
        GroupStat(
            group_name=name,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_gross_profit_rate=_avg(s["gp"]),
        )
        for name, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"])
    ]


# ── 产品/系列分析 ──────────────────────────────────────────────────────────────

@router.get("/products", response_model=list[ProductStat])
async def products_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按产品大类 + 系列汇总"""
    rows = await _load(db, year, user)

    stats: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, ordered=0, qty=0, trade=0.0, quotes=[], gp=[])
    )
    for r in rows:
        cat = r.product_category or "未知"
        ser = r.series_name or ""
        key = (cat, ser)
        s = stats[key]
        s["inquiry"] += 1
        s["qty"] += int(r.quantity or 0)
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)
        if r.final_quote is not None:
            s["quotes"].append(float(r.final_quote))
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    return [
        ProductStat(
            product_category=cat,
            series_name=ser,
            inquiry_count=s["inquiry"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_quantity=s["qty"],
            total_trade_amount=s["trade"],
            avg_final_quote=_avg(s["quotes"]),
            avg_gross_profit_rate=_avg(s["gp"]),
        )
        for (cat, ser), s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"])
    ]


# ── 季度分析 ──────────────────────────────────────────────────────────────────

@router.get("/quarters", response_model=list[QuarterStat])
async def quarters_analysis(db: DbDep, user: UserDep):
    """按年份+季度汇总，含 QoQ 对比"""
    rows = await _load(db, year=None, user=user)

    stats: dict[tuple[int, int], dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0)
    )
    for r in rows:
        if not r.inquiry_year or not r.inquiry_month:
            continue
        q = MONTH_TO_QUARTER.get(r.inquiry_month)
        if q is None:
            continue
        key = (r.inquiry_year, q)
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)

    ordered_keys = sorted(stats.keys())

    result: list[QuarterStat] = []
    for i, (year, quarter) in enumerate(ordered_keys):
        s = stats[(year, quarter)]
        prev_trade: float | None = None
        change_pct: float | None = None

        if i > 0:
            py, pq = ordered_keys[i - 1]
            prev_s = stats[(py, pq)]
            prev_trade = prev_s["trade"]
            if prev_trade and prev_trade > 0:
                change_pct = round((s["trade"] - prev_trade) / prev_trade * 100, 1)

        season_type = "SS" if quarter in (1, 2) else "FW/AW"
        result.append(QuarterStat(
            year=year,
            quarter=quarter,
            quarter_label=f"{year} Q{quarter}",
            season_type=season_type,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            prev_quarter_trade=prev_trade,
            trade_change_pct=change_pct,
        ))

    result.reverse()
    return result
