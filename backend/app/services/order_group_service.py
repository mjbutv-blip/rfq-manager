from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_view_inquiry
from app.models import FactoryQuoteRecord, Inquiry, OrderGroup, OrderGroupItem, QuoteItem

DOMESTIC = "domestic"


def _num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _factory_key(name: str | None) -> str:
    return (name or "").strip().lower()


def _quantity(inq: Inquiry, quote_item: QuoteItem | None) -> int | None:
    return quote_item.order_quantity if quote_item and quote_item.order_quantity else inq.quantity


def _exchange_rate(quote_item: QuoteItem | None) -> float | None:
    if quote_item is None:
        return None
    return _num(quote_item.current_exchange_rate) or _num(quote_item.exchange_rate)


def _quote_item_for(inquiry_id, quote_items: list[QuoteItem]) -> QuoteItem | None:
    for item in quote_items:
        if item.inquiry_id == inquiry_id and item.quote_round == 1 and (item.quote_type or DOMESTIC) == DOMESTIC:
            return item
    return None


def _valid_quotes_for(inquiry_id, quotes: list[FactoryQuoteRecord]) -> list[FactoryQuoteRecord]:
    return [
        q for q in quotes
        if q.inquiry_id == inquiry_id
        and q.quote_round == 1
        and (q.quote_type or DOMESTIC) == DOMESTIC
        and q.factory_price is not None
    ]


def _profit_for(inq: Inquiry, quote_item: QuoteItem | None, factory_price: float | None) -> dict[str, Any]:
    qty = _quantity(inq, quote_item)
    final_quote_usd = _num(quote_item.final_quote_usd) if quote_item else _num(inq.final_quote)
    exchange_rate = _exchange_rate(quote_item)
    if qty is None or final_quote_usd is None or exchange_rate is None or factory_price is None:
        return {
            "quantity": qty,
            "customer_amount_cny": None,
            "factory_cost_cny": None,
            "gross_profit_cny": None,
            "gross_profit_rate": None,
            "missing_fields": [
                label for label, value in (
                    ("数量", qty),
                    ("给客人报的价格", final_quote_usd),
                    ("汇率", exchange_rate),
                    ("工厂价", factory_price),
                ) if value is None
            ],
        }
    customer_amount = final_quote_usd * qty * exchange_rate
    factory_cost = factory_price * qty
    port_misc = (_num(quote_item.port_misc_fee_cny) or 0) * qty if quote_item else 0
    commission = customer_amount * ((_num(quote_item.commission_pct) or 0) / 100) if quote_item else 0
    gross = customer_amount - factory_cost - port_misc - commission
    return {
        "quantity": qty,
        "customer_amount_cny": customer_amount,
        "factory_cost_cny": factory_cost,
        "gross_profit_cny": gross,
        "gross_profit_rate": gross / customer_amount if customer_amount else None,
        "missing_fields": [],
    }


def _sum_profit(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if any(r["customer_amount_cny"] is None or r["factory_cost_cny"] is None or r["gross_profit_cny"] is None for r in rows):
        return {
            "customer_amount_cny": None,
            "factory_cost_cny": None,
            "gross_profit_cny": None,
            "gross_profit_rate": None,
            "missing_fields": sorted({f for r in rows for f in r.get("missing_fields", [])}),
        }
    customer = sum(r["customer_amount_cny"] for r in rows)
    cost = sum(r["factory_cost_cny"] for r in rows)
    gross = sum(r["gross_profit_cny"] for r in rows)
    return {
        "customer_amount_cny": customer,
        "factory_cost_cny": cost,
        "gross_profit_cny": gross,
        "gross_profit_rate": gross / customer if customer else None,
        "missing_fields": [],
    }


def _units_consistent(quotes: list[FactoryQuoteRecord]) -> bool:
    units = {(q.currency, q.price_unit) for q in quotes if q.factory_price is not None}
    return len(units) <= 1


def _scenario(label: str, code: str, selections: list[dict[str, Any]], note: str) -> dict[str, Any]:
    profit_rows = [s["profit"] for s in selections]
    totals = _sum_profit(profit_rows)
    factory_count = len({_factory_key(s["factory_name"]) for s in selections if s.get("factory_name")})
    return {
        "code": code,
        "label": label,
        "selections": selections,
        "factory_count": factory_count,
        **totals,
        "management_note": note,
    }


def build_order_group_analysis(
    inquiries: list[Inquiry],
    quote_items: list[QuoteItem],
    factory_quotes: list[FactoryQuoteRecord],
) -> dict[str, Any]:
    quote_by_inquiry = {inq.id: _quote_item_for(inq.id, quote_items) for inq in inquiries}
    inquiry_rows: list[dict[str, Any]] = []
    warnings: list[str] = []

    lowest_map: dict[uuid.UUID, FactoryQuoteRecord | None] = {}
    for inq in inquiries:
        qitem = quote_by_inquiry[inq.id]
        valid = _valid_quotes_for(inq.id, factory_quotes)
        comparable = _units_consistent(valid)
        sorted_quotes = sorted(valid, key=lambda q: (float(q.factory_price), q.factory_name or ""))
        lowest = sorted_quotes[0] if sorted_quotes and comparable else None
        highest = sorted_quotes[-1] if sorted_quotes and comparable else None
        second = next((q for q in sorted_quotes if lowest and float(q.factory_price) > float(lowest.factory_price)), None)
        lowest_map[inq.id] = lowest
        spread = float(highest.factory_price) - float(lowest.factory_price) if lowest and highest and highest.id != lowest.id else None
        spread_pct = spread / float(lowest.factory_price) if spread is not None and lowest.factory_price else None
        if not valid:
            warnings.append(f"{inq.inquiry_no} 第一轮国内没有有效工厂报价")
        if valid and not comparable:
            warnings.append(f"{inq.inquiry_no} 第一轮国内报价币种或单位不一致，暂不比较")
        if spread_pct is not None and spread_pct >= 0.15:
            warnings.append(f"{inq.inquiry_no} 工厂报价差异较大，建议复核报价口径")

        inquiry_rows.append({
            "inquiry_id": str(inq.id),
            "inquiry_no": inq.inquiry_no,
            "customer_order_no": inq.customer_order_no,
            "product_name": inq.product_name,
            "quantity": _quantity(inq, qitem),
            "order_status": inq.order_status,
            "selected_factory": qitem.selected_factory if qitem else None,
            "final_quote_usd": _num(qitem.final_quote_usd) if qitem else _num(inq.final_quote),
            "selected_factory_price_cny": _num(qitem.selected_factory_price_cny) if qitem else _num(inq.factory_price),
            "gross_profit_cny": _num(qitem.gross_profit_cny) if qitem else None,
            "trade_amount_usd": _num(qitem.trade_amount_usd) if qitem else _num(inq.trade_amount),
            "lowest_factory": lowest.factory_name if lowest else None,
            "lowest_price": _num(lowest.factory_price) if lowest else None,
            "highest_factory": highest.factory_name if highest else None,
            "highest_price": _num(highest.factory_price) if highest else None,
            "second_lowest_factory": second.factory_name if second else None,
            "second_lowest_price": _num(second.factory_price) if second else None,
            "spread_amount": spread,
            "spread_pct": spread_pct,
        })

    scenario_a_selections = []
    for inq in inquiries:
        lowest = lowest_map.get(inq.id)
        price = _num(lowest.factory_price) if lowest else None
        scenario_a_selections.append({
            "inquiry_id": str(inq.id),
            "inquiry_no": inq.inquiry_no,
            "factory_name": lowest.factory_name if lowest else None,
            "factory_price": price,
            "profit": _profit_for(inq, quote_by_inquiry[inq.id], price),
        })
    scenario_a = _scenario("每个询单选择本询单最低价工厂", "A", scenario_a_selections, "理论成本最低；如分散到多个工厂，沟通和交付复杂度更高。")

    valid_by_inquiry = {inq.id: _valid_quotes_for(inq.id, factory_quotes) for inq in inquiries}
    factory_sets = [set(_factory_key(q.factory_name) for q in valid_by_inquiry[inq.id] if q.factory_name) for inq in inquiries]
    common_factories = set.intersection(*factory_sets) if factory_sets else set()
    unified_scenarios = []
    for factory_key in common_factories:
        selections = []
        display_name = None
        for inq in inquiries:
            rec = next(q for q in valid_by_inquiry[inq.id] if _factory_key(q.factory_name) == factory_key)
            display_name = display_name or rec.factory_name
            price = _num(rec.factory_price)
            selections.append({
                "inquiry_id": str(inq.id),
                "inquiry_no": inq.inquiry_no,
                "factory_name": rec.factory_name,
                "factory_price": price,
                "profit": _profit_for(inq, quote_by_inquiry[inq.id], price),
            })
        sc = _scenario(f"整组统一给 {display_name}", "B", selections, "工厂集中度高；仍需人工确认交期、质量、产能和客户要求。")
        sc["unified_factory"] = display_name
        if scenario_a["factory_cost_cny"] is not None and sc["factory_cost_cny"] is not None:
            sc["extra_cost_vs_lowest"] = sc["factory_cost_cny"] - scenario_a["factory_cost_cny"]
        else:
            sc["extra_cost_vs_lowest"] = None
        if scenario_a["gross_profit_cny"] is not None and sc["gross_profit_cny"] is not None:
            sc["profit_gap_vs_lowest"] = sc["gross_profit_cny"] - scenario_a["gross_profit_cny"]
        else:
            sc["profit_gap_vs_lowest"] = None
        unified_scenarios.append(sc)
    unified_scenarios.sort(key=lambda s: (s["gross_profit_cny"] is not None, s["gross_profit_cny"] or 0), reverse=True)

    scenario_c_selections = []
    for inq in inquiries:
        qitem = quote_by_inquiry[inq.id]
        selected_factory = qitem.selected_factory if qitem else None
        selected_price = _num(qitem.selected_factory_price_cny) if qitem else _num(inq.factory_price)
        if selected_factory and selected_price is None:
            rec = next((q for q in valid_by_inquiry[inq.id] if _factory_key(q.factory_name) == _factory_key(selected_factory)), None)
            selected_price = _num(rec.factory_price) if rec else None
        scenario_c_selections.append({
            "inquiry_id": str(inq.id),
            "inquiry_no": inq.inquiry_no,
            "factory_name": selected_factory,
            "factory_price": selected_price,
            "profit": _profit_for(inq, qitem, selected_price),
        })
    scenario_c = _scenario("当前系统选用工厂方案", "C", scenario_c_selections, "反映当前 quote_items.selected_factory；不是系统推荐。")
    if scenario_a["gross_profit_cny"] is not None and scenario_c["gross_profit_cny"] is not None:
        scenario_c["profit_gap_vs_lowest"] = scenario_c["gross_profit_cny"] - scenario_a["gross_profit_cny"]
    else:
        scenario_c["profit_gap_vs_lowest"] = None
    best_unified = unified_scenarios[0] if unified_scenarios else None
    if best_unified and best_unified["gross_profit_cny"] is not None and scenario_c["gross_profit_cny"] is not None:
        scenario_c["profit_gap_vs_best_unified"] = scenario_c["gross_profit_cny"] - best_unified["gross_profit_cny"]
    else:
        scenario_c["profit_gap_vs_best_unified"] = None

    total_qty = sum((r["quantity"] or 0) for r in inquiry_rows)
    total_trade = sum((r["trade_amount_usd"] or 0) for r in inquiry_rows)
    for row in inquiry_rows:
        row["quantity_share"] = (row["quantity"] or 0) / total_qty if total_qty else None
        row["trade_amount_share"] = (row["trade_amount_usd"] or 0) / total_trade if total_trade else None

    return {
        "inquiries": inquiry_rows,
        "scenarios": {
            "lowest_each": scenario_a,
            "unified_factory": unified_scenarios,
            "current_selected": scenario_c,
            "custom_placeholder": {"label": "自定义组合方案", "status": "reserved"},
        },
        "auxiliary_metrics": {
            "factory_concentration": {
                "lowest_each_factory_count": scenario_a["factory_count"],
                "current_factory_count": scenario_c["factory_count"],
                "common_factory_count": len(common_factories),
            },
            "missing_quote_inquiries": [r["inquiry_no"] for r in inquiry_rows if not r["lowest_factory"]],
            "quantity_key_inquiries": sorted(inquiry_rows, key=lambda r: r["quantity_share"] or 0, reverse=True)[:3],
        },
        "warnings": sorted(set(warnings)),
    }


async def load_order_group_or_403(db: AsyncSession, group_id: uuid.UUID, user) -> tuple[OrderGroup, list[OrderGroupItem], list[Inquiry]]:
    group = await db.get(OrderGroup, group_id)
    if not group:
        raise LookupError("订单组不存在")
    items = (await db.execute(
        select(OrderGroupItem).where(OrderGroupItem.order_group_id == group_id).order_by(OrderGroupItem.sort_order)
    )).scalars().all()
    inquiries = []
    for item in items:
        inq = await db.get(Inquiry, item.inquiry_id)
        if inq:
            inquiries.append(inq)
    if not inquiries or not all(can_view_inquiry(inq, user) for inq in inquiries):
        raise PermissionError("无权查看该订单组")
    return group, items, inquiries


async def list_order_groups(db: AsyncSession, user) -> list[dict[str, Any]]:
    groups = (await db.execute(select(OrderGroup).where(OrderGroup.group_status != "cancelled").order_by(OrderGroup.created_at.desc()))).scalars().all()
    result = []
    for group in groups:
        items = (await db.execute(select(OrderGroupItem).where(OrderGroupItem.order_group_id == group.id).order_by(OrderGroupItem.sort_order))).scalars().all()
        inquiries = [await db.get(Inquiry, item.inquiry_id) for item in items]
        inquiries = [inq for inq in inquiries if inq]
        if not inquiries or not all(can_view_inquiry(inq, user) for inq in inquiries):
            continue
        result.append({
            "id": str(group.id),
            "group_code": group.group_code,
            "group_name": group.group_name,
            "customer_code": group.customer_code,
            "customer_name": next((inq.customer_short_name or inq.customer_name for inq in inquiries if inq.customer_short_name or inq.customer_name), None),
            "inquiry_count": len(inquiries),
            "inquiry_nos": [inq.inquiry_no for inq in inquiries],
            "source_file_name": group.source_file_name,
            "source_sheet": group.source_sheet,
            "source_start_row": group.source_start_row,
            "source_end_row": group.source_end_row,
            "group_status": group.group_status,
            "created_at": group.created_at.isoformat() if group.created_at else None,
        })
    return result


async def get_order_group_detail(db: AsyncSession, group_id: uuid.UUID, user) -> dict[str, Any]:
    group, items, inquiries = await load_order_group_or_403(db, group_id, user)
    inquiry_ids = [inq.id for inq in inquiries]
    quote_items = (await db.execute(select(QuoteItem).where(QuoteItem.inquiry_id.in_(inquiry_ids)))).scalars().all()
    factory_quotes = (await db.execute(select(FactoryQuoteRecord).where(FactoryQuoteRecord.inquiry_id.in_(inquiry_ids)))).scalars().all()
    return {
        "group": {
            "id": str(group.id),
            "group_code": group.group_code,
            "group_name": group.group_name,
            "source_file_name": group.source_file_name,
            "source_sheet": group.source_sheet,
            "source_start_row": group.source_start_row,
            "source_end_row": group.source_end_row,
            "customer_code": group.customer_code,
            "group_status": group.group_status,
            "notes": group.notes,
            "created_at": group.created_at.isoformat() if group.created_at else None,
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
        "analysis": build_order_group_analysis(inquiries, quote_items, factory_quotes),
    }
