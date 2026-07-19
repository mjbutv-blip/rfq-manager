from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_view_inquiry
from app.models import Customer, FactoryQuoteRecord, Inquiry, InquiryItem, OrderGroup, OrderGroupItem, OrderSeries, OrderSeriesItem, QuoteItem
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


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _series_name_from_file(file_name: str | None, fallback: str | None = None) -> str | None:
    raw = _clean_text(file_name)
    if not raw:
        return fallback
    title = raw.rsplit("/", 1)[-1]
    title = re.sub(r"\.(xlsx|xlsm|xls)$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"\s*(德国|美国|英国|日本|国内|海外)\s*$", "", title)
    title = re.sub(r"(单报价单|报价单|单)$", "", title).strip()
    return title or fallback


def _mode(values: list[str | None]) -> str | None:
    cleaned = [v for v in values if v]
    return Counter(cleaned).most_common(1)[0][0] if cleaned else None


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


async def backfill_order_series(db: AsyncSession, user, dry_run: bool = True) -> dict[str, Any]:
    existing_series_items = set((await db.execute(select(OrderSeriesItem.inquiry_id))).scalars().all())
    existing_series_rows = (await db.execute(select(OrderSeries).where(OrderSeries.series_status != "cancelled"))).scalars().all()
    existing_by_source = {
        (series.source_file_name, series.source_sheet): series
        for series in existing_series_rows
        if series.source_file_name and series.source_sheet
    }

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.extra_data.is_not(None)).order_by(InquiryItem.inquiry_no)
    )).scalars().all()

    grouped: dict[tuple[str, str], dict[uuid.UUID, dict[str, Any]]] = {}
    skipped_no_source = 0
    skipped_existing = 0
    for item in items:
        if not item.inquiry_id or item.inquiry_id in existing_series_items:
            skipped_existing += 1
            continue
        extra = item.extra_data or {}
        source_file = _clean_text(extra.get("source_file") or extra.get("file_name"))
        source_sheet = _clean_text(extra.get("source_sheet"))
        source_row = extra.get("source_row")
        if not source_file or not source_sheet:
            skipped_no_source += 1
            continue
        bucket = grouped.setdefault((source_file, source_sheet), {})
        current = bucket.get(item.inquiry_id)
        row_num = int(source_row) if isinstance(source_row, int) or (isinstance(source_row, str) and source_row.isdigit()) else None
        if current is None or (row_num is not None and (current.get("source_row") is None or row_num < current["source_row"])):
            bucket[item.inquiry_id] = {
                "inquiry_id": item.inquiry_id,
                "inquiry_no": item.inquiry_no,
                "source_row": row_num,
                "series_name": item.series_name,
            }

    candidates: list[dict[str, Any]] = []
    created_series: list[dict[str, Any]] = []
    updated_series: list[dict[str, Any]] = []
    linked_groups = 0

    for idx, ((source_file, source_sheet), row_map) in enumerate(sorted(grouped.items(), key=lambda kv: (kv[0][0], kv[0][1])), start=1):
        rows = sorted(row_map.values(), key=lambda row: (row.get("source_row") is None, row.get("source_row") or 0, row.get("inquiry_no") or ""))
        if len(rows) < 2:
            continue
        inquiry_ids = [row["inquiry_id"] for row in rows]
        inquiries = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inquiry_ids)))).scalars().all()
        inquiry_by_id = {inq.id: inq for inq in inquiries}
        ordered_inquiries = [inquiry_by_id[row["inquiry_id"]] for row in rows if row["inquiry_id"] in inquiry_by_id]
        if len(ordered_inquiries) < 2:
            continue

        source_rows = [row["source_row"] for row in rows if row.get("source_row") is not None]
        fallback_series_name = _mode([row.get("series_name") for row in rows] + [inq.series_name for inq in ordered_inquiries])
        series_name = _series_name_from_file(source_file, fallback_series_name)
        customer_code = _mode([inq.customer_code for inq in ordered_inquiries])
        existing = existing_by_source.get((source_file, source_sheet))
        candidate = {
            "source_file_name": source_file,
            "source_sheet": source_sheet,
            "series_name": series_name,
            "source_start_row": min(source_rows) if source_rows else None,
            "source_end_row": max(source_rows) if source_rows else None,
            "customer_code": customer_code,
            "inquiry_count": len(ordered_inquiries),
            "inquiry_nos": [inq.inquiry_no for inq in ordered_inquiries],
            "action": "update_existing" if existing else "create",
        }
        candidates.append(candidate)
        if dry_run:
            continue

        customer_id = None
        if customer_code:
            customer = (await db.execute(select(Customer).where(Customer.customer_code == customer_code))).scalars().first()
            customer_id = customer.id if customer else None

        if existing:
            order_series = existing
            added_count = 0
        else:
            order_series = OrderSeries(
                series_code=f"OS-BACKFILL-{datetime.utcnow():%Y%m%d}-{idx:04d}",
                series_name=series_name,
                source_file_name=source_file,
                source_sheet=source_sheet,
                source_start_row=candidate["source_start_row"],
                source_end_row=candidate["source_end_row"],
                customer_code=customer_code,
                customer_id=customer_id,
                series_status="active",
                created_by=getattr(user, "username", None),
                notes="历史数据回填：按 inquiry_items.extra_data.source_file + source_sheet 归为报价单系列",
            )
            db.add(order_series)
            await db.flush()
            added_count = 0

        for sort_order, row in enumerate(rows, start=1):
            inq = inquiry_by_id.get(row["inquiry_id"])
            if not inq:
                continue
            db.add(OrderSeriesItem(
                order_series_id=order_series.id,
                inquiry_id=inq.id,
                inquiry_no=inq.inquiry_no,
                source_sheet=source_sheet,
                source_row=row.get("source_row"),
                sort_order=sort_order,
                is_confirmed=True,
            ))
            added_count += 1

        groups = await _groups_for_inquiries(db, [inq.id for inq in ordered_inquiries])
        for group, _group_items in groups:
            if group.order_series_id is None:
                group.order_series_id = order_series.id
                linked_groups += 1

        payload = {**candidate, "id": str(order_series.id), "series_code": order_series.series_code, "added_items": added_count}
        if existing:
            updated_series.append(payload)
        else:
            created_series.append(payload)

    return {
        "dry_run": dry_run,
        "candidate_count": len(candidates),
        "would_create": sum(1 for c in candidates if c["action"] == "create"),
        "would_update_existing": sum(1 for c in candidates if c["action"] == "update_existing"),
        "created_count": len(created_series),
        "updated_existing_count": len(updated_series),
        "linked_order_groups": linked_groups,
        "skipped_existing_item_rows": skipped_existing,
        "skipped_no_source_rows": skipped_no_source,
        "candidates": candidates[:50],
        "created_series": created_series[:50],
        "updated_series": updated_series[:50],
    }


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
