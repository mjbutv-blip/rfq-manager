from __future__ import annotations

import uuid
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_view_inquiry
from app.models import FactoryQuoteRecord, Inquiry, OrderGroup, OrderGroupItem, OrderSeries, OrderSeriesItem, QuoteItem
from app.services.order_group_service import build_order_group_analysis


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _sum_or_none(values: list[float | None]) -> float | None:
    return None if any(v is None for v in values) else sum(v for v in values if v is not None)


async def load_order_series_or_403(db: AsyncSession, series_id: uuid.UUID, user) -> tuple[OrderSeries, list[OrderSeriesItem], list[Inquiry]]:
    series = await db.get(OrderSeries, series_id)
    if not series:
        raise LookupError("报价单系列不存在")
    items = (await db.execute(
        select(OrderSeriesItem).where(OrderSeriesItem.order_series_id == series_id).order_by(OrderSeriesItem.sort_order)
    )).scalars().all()
    inquiries = []
    for item in items:
        inq = await db.get(Inquiry, item.inquiry_id)
        if inq:
            inquiries.append(inq)
    if not inquiries or not all(can_view_inquiry(inq, user) for inq in inquiries):
        raise PermissionError("无权查看该报价单系列")
    return series, items, inquiries


async def _groups_for_inquiries(db: AsyncSession, inquiry_ids: list[uuid.UUID]) -> list[tuple[OrderGroup, list[OrderGroupItem]]]:
    if not inquiry_ids:
        return []
    group_items = (await db.execute(
        select(OrderGroupItem).where(OrderGroupItem.inquiry_id.in_(inquiry_ids)).order_by(OrderGroupItem.sort_order)
    )).scalars().all()
    by_group: dict[uuid.UUID, list[OrderGroupItem]] = {}
    for item in group_items:
        by_group.setdefault(item.order_group_id, []).append(item)
    if not by_group:
        return []
    groups = (await db.execute(
        select(OrderGroup).where(OrderGroup.id.in_(by_group.keys()), OrderGroup.group_status != "cancelled")
    )).scalars().all()
    return [(group, sorted(by_group[group.id], key=lambda item: item.sort_order)) for group in groups]


async def list_order_series(db: AsyncSession, user) -> list[dict[str, Any]]:
    series_rows = (await db.execute(
        select(OrderSeries).where(OrderSeries.series_status != "cancelled").order_by(OrderSeries.created_at.desc())
    )).scalars().all()
    result: list[dict[str, Any]] = []
    for series in series_rows:
        items = (await db.execute(
            select(OrderSeriesItem).where(OrderSeriesItem.order_series_id == series.id).order_by(OrderSeriesItem.sort_order)
        )).scalars().all()
        inquiries = [await db.get(Inquiry, item.inquiry_id) for item in items]
        inquiries = [inq for inq in inquiries if inq]
        if not inquiries or not all(can_view_inquiry(inq, user) for inq in inquiries):
            continue
        groups = await _groups_for_inquiries(db, [inq.id for inq in inquiries])
        result.append({
            "id": str(series.id),
            "series_code": series.series_code,
            "series_name": series.series_name,
            "customer_code": series.customer_code,
            "customer_name": next((inq.customer_short_name or inq.customer_name for inq in inquiries if inq.customer_short_name or inq.customer_name), None),
            "inquiry_count": len(inquiries),
            "inquiry_nos": [inq.inquiry_no for inq in inquiries],
            "order_group_count": len(groups),
            "source_file_name": series.source_file_name,
            "source_sheet": series.source_sheet,
            "source_start_row": series.source_start_row,
            "source_end_row": series.source_end_row,
            "series_status": series.series_status,
            "created_at": series.created_at.isoformat() if series.created_at else None,
        })
    return result


def _series_summary(analysis: dict[str, Any], groups: list[tuple[OrderGroup, list[OrderGroupItem]]]) -> dict[str, Any]:
    rows = analysis["inquiries"]
    total_quantity = sum((row["quantity"] or 0) for row in rows)
    trade_total = _sum_or_none([row["trade_amount_usd"] for row in rows])
    gross_total = _sum_or_none([row["gross_profit_cny"] for row in rows])
    selected_factories = [row["selected_factory"] for row in rows if row.get("selected_factory")]
    grouped_inquiry_nos = {item.inquiry_no for _group, items in groups for item in items}
    return {
        "total_quantity": total_quantity,
        "trade_amount_usd": trade_total,
        "gross_profit_cny": gross_total,
        "selected_factory_count": len({f.strip().lower() for f in selected_factories if f}),
        "top_selected_factories": [
            {"factory_name": name, "count": count}
            for name, count in Counter(selected_factories).most_common(5)
        ],
        "order_group_count": len(groups),
        "ungrouped_inquiry_nos": [row["inquiry_no"] for row in rows if row["inquiry_no"] not in grouped_inquiry_nos],
        "missing_quote_inquiries": analysis["auxiliary_metrics"]["missing_quote_inquiries"],
    }


async def get_order_series_detail(db: AsyncSession, series_id: uuid.UUID, user) -> dict[str, Any]:
    series, items, inquiries = await load_order_series_or_403(db, series_id, user)
    inquiry_ids = [inq.id for inq in inquiries]
    quote_items = (await db.execute(select(QuoteItem).where(QuoteItem.inquiry_id.in_(inquiry_ids)))).scalars().all()
    factory_quotes = (await db.execute(select(FactoryQuoteRecord).where(FactoryQuoteRecord.inquiry_id.in_(inquiry_ids)))).scalars().all()
    analysis = build_order_group_analysis(inquiries, quote_items, factory_quotes)
    groups = await _groups_for_inquiries(db, inquiry_ids)
    group_payload = []
    for group, group_items in groups:
        group_payload.append({
            "id": str(group.id),
            "group_code": group.group_code,
            "group_name": group.group_name,
            "inquiry_nos": [item.inquiry_no for item in group_items],
            "source_start_row": group.source_start_row,
            "source_end_row": group.source_end_row,
            "group_status": group.group_status,
        })
    return {
        "series": {
            "id": str(series.id),
            "series_code": series.series_code,
            "series_name": series.series_name,
            "source_file_name": series.source_file_name,
            "source_sheet": series.source_sheet,
            "source_start_row": series.source_start_row,
            "source_end_row": series.source_end_row,
            "customer_code": series.customer_code,
            "series_status": series.series_status,
            "notes": series.notes,
            "created_at": series.created_at.isoformat() if series.created_at else None,
        },
        "items": [
            {
                "id": str(item.id),
                "inquiry_id": str(item.inquiry_id),
                "inquiry_no": item.inquiry_no,
                "source_sheet": item.source_sheet,
                "source_row": item.source_row,
                "sort_order": item.sort_order,
            }
            for item in items
        ],
        "order_groups": group_payload,
        "analysis": {
            **analysis,
            "series_summary": _series_summary(analysis, groups),
        },
    }
