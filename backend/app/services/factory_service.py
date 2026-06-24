"""
工厂档案服务

工厂统计全部实时从 factory_quote_records 聚合，不存储冗余字段。
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.factory import Factory
from app.models.factory_quote_record import FactoryQuoteRecord


# ── 工厂编码自动生成 ──────────────────────────────────────────────────────────

async def generate_factory_code(db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count()).select_from(Factory)
    )
    n = (result.scalar_one() or 0) + 1
    return f"F{n:04d}"


# ── 工厂统计（单个工厂）──────────────────────────────────────────────────────

async def get_factory_stats(db: AsyncSession, factory_id: uuid.UUID) -> dict[str, Any]:
    # 询单详情页"工厂报价录入"按轮次填报的卡片（quote_round 非空）跟这里的"一次成交快照"
    # 统计口径不是一回事——同一笔生意议价 3 轮就会有 3 条记录，混进来会把
    # avg_factory_price / quote_count 拉偏。这里的统计只看导入/旧表单产生的快照行。
    base = select(FactoryQuoteRecord).where(
        FactoryQuoteRecord.factory_id == factory_id,
        FactoryQuoteRecord.quote_round.is_(None),
    )

    # 聚合指标
    agg = await db.execute(
        select(
            func.count().label("quote_count"),
            func.sum(case((FactoryQuoteRecord.is_ordered == True, 1), else_=0)).label("ordered_count"),
            func.sum(
                case((FactoryQuoteRecord.is_ordered == True, FactoryQuoteRecord.trade_amount), else_=None)
            ).label("total_trade_amount"),
            func.avg(FactoryQuoteRecord.factory_price).label("avg_factory_price"),
            func.max(FactoryQuoteRecord.quote_date).label("last_quote_date"),
            func.max(
                case((FactoryQuoteRecord.is_ordered == True, FactoryQuoteRecord.quote_date), else_=None)
            ).label("last_order_date"),
        ).where(
            FactoryQuoteRecord.factory_id == factory_id,
            FactoryQuoteRecord.quote_round.is_(None),
        )
    )
    row = agg.fetchone()

    quote_count    = int(row.quote_count or 0)
    ordered_count  = int(row.ordered_count or 0)
    conversion_rate = round(ordered_count / quote_count * 100, 1) if quote_count > 0 else None
    total_trade    = float(row.total_trade_amount) if row.total_trade_amount else None
    avg_price      = float(row.avg_factory_price) if row.avg_factory_price else None
    last_quote     = row.last_quote_date.isoformat() if row.last_quote_date else None
    last_order     = row.last_order_date.isoformat() if row.last_order_date else None

    # Top 3 品类
    cat_rows = await db.execute(
        select(FactoryQuoteRecord.product_category, func.count().label("n"))
        .where(
            FactoryQuoteRecord.factory_id == factory_id,
            FactoryQuoteRecord.quote_round.is_(None),
            FactoryQuoteRecord.product_category.isnot(None),
        )
        .group_by(FactoryQuoteRecord.product_category)
        .order_by(func.count().desc())
        .limit(3)
    )
    top_categories = [{"name": r.product_category, "count": r.n} for r in cat_rows]

    # Top 3 系列
    ser_rows = await db.execute(
        select(FactoryQuoteRecord.series_name, func.count().label("n"))
        .where(
            FactoryQuoteRecord.factory_id == factory_id,
            FactoryQuoteRecord.quote_round.is_(None),
            FactoryQuoteRecord.series_name.isnot(None),
        )
        .group_by(FactoryQuoteRecord.series_name)
        .order_by(func.count().desc())
        .limit(3)
    )
    top_series = [{"name": r.series_name, "count": r.n} for r in ser_rows]

    return {
        "quote_count": quote_count,
        "ordered_count": ordered_count,
        "conversion_rate": conversion_rate,
        "total_trade_amount": total_trade,
        "avg_factory_price": avg_price,
        "top_categories": top_categories,
        "top_series": top_series,
        "last_quote_date": last_quote,
        "last_order_date": last_order,
    }


# ── 工厂统计（列表页批量）──────────────────────────────────────────────────────

async def get_factory_list_stats(db: AsyncSession, factory_ids: list[uuid.UUID]) -> dict[str, dict]:
    if not factory_ids:
        return {}
    rows = await db.execute(
        select(
            FactoryQuoteRecord.factory_id,
            func.count().label("quote_count"),
            func.sum(case((FactoryQuoteRecord.is_ordered == True, 1), else_=0)).label("ordered_count"),
            func.sum(
                case((FactoryQuoteRecord.is_ordered == True, FactoryQuoteRecord.trade_amount), else_=None)
            ).label("total_trade_amount"),
        )
        .where(
            FactoryQuoteRecord.factory_id.in_(factory_ids),
            FactoryQuoteRecord.quote_round.is_(None),
        )
        .group_by(FactoryQuoteRecord.factory_id)
    )
    result: dict[str, dict] = {}
    for r in rows:
        qc = int(r.quote_count or 0)
        oc = int(r.ordered_count or 0)
        result[str(r.factory_id)] = {
            "quote_count": qc,
            "ordered_count": oc,
            "order_conversion_rate": round(oc / qc * 100, 1) if qc > 0 else None,
            "total_trade_amount": float(r.total_trade_amount) if r.total_trade_amount else None,
        }
    return result


# ── 列表页 summary 卡片 ───────────────────────────────────────────────────────

async def get_factory_summary(db: AsyncSession) -> dict[str, int]:
    total = await db.scalar(select(func.count()).select_from(Factory))
    active = await db.scalar(
        select(func.count()).select_from(Factory).where(Factory.cooperation_status == "active")
    )
    high_risk = await db.scalar(
        select(func.count()).select_from(Factory).where(Factory.risk_level == "high")
    )
    with_quotes = await db.scalar(
        select(func.count(FactoryQuoteRecord.factory_id.distinct())).select_from(FactoryQuoteRecord)
    )
    return {
        "total_factories": int(total or 0),
        "active_factories": int(active or 0),
        "high_risk_factories": int(high_risk or 0),
        "factories_with_quotes": int(with_quotes or 0),
    }


# ── 导入时 upsert 工厂 ────────────────────────────────────────────────────────

async def find_or_create_factory(db: AsyncSession, factory_name: str) -> Factory:
    """按 factory_name 查找工厂，不存在则自动创建。"""
    name = factory_name.strip()
    result = await db.execute(
        select(Factory).where(Factory.factory_name == name)
    )
    factory = result.scalar_one_or_none()
    if factory:
        return factory

    code = await generate_factory_code(db)
    factory = Factory(
        id=uuid.uuid4(),
        factory_code=code,
        factory_name=name,
        factory_short_name=name[:20] if len(name) > 20 else name,
        cooperation_status="active",
    )
    db.add(factory)
    await db.flush()
    return factory


# ── 操作日志快照 ──────────────────────────────────────────────────────────────

_FACTORY_FIELDS = (
    "factory_code", "factory_name", "factory_short_name",
    "country", "cooperation_status", "risk_level",
    "price_position", "moq", "normal_lead_time_days",
)

_QUOTE_RECORD_FIELDS = (
    "factory_name", "inquiry_no", "product_category",
    "factory_price", "quote_date", "is_ordered", "trade_amount",
)


def factory_snapshot(factory: Factory) -> dict[str, Any]:
    from app.services.operation_log_service import _to_json, snapshot
    return snapshot(factory, _FACTORY_FIELDS)


def quote_record_snapshot(record: FactoryQuoteRecord) -> dict[str, Any]:
    from app.services.operation_log_service import snapshot
    return snapshot(record, _QUOTE_RECORD_FIELDS)
