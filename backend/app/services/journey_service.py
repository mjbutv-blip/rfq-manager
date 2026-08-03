"""
单个订单的来龙去脉表（询单报价详情表）

只读汇总页的计算逻辑。唯一数据源是 factory_quote_records（按轮次填报的
工厂报价卡片，quote_round 非空的那部分）——这里不存储、不复制任何报价
数据，每次都是请求时实时从 factory_quote_records 重新计算。
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.models.factory_quote_record import FactoryQuoteRecord
from app.models.quote import QuoteItem


def _brief(r: FactoryQuoteRecord) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "factory_id": str(r.factory_id) if r.factory_id else None,
        "factory_name": r.factory_name,
        "factory_price": float(r.factory_price) if r.factory_price is not None else None,
        "quote_type": r.quote_type or "domestic",
        "currency": r.currency,
        "price_unit": r.price_unit,
        "remark": r.remark,
        "source_sheet": r.source_sheet,
        "source_cell": r.source_cell,
        "quoted_by": r.quoted_by,
        "quoted_at": r.quoted_at.isoformat() if r.quoted_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def quote_item_brief(item: QuoteItem | None) -> dict[str, Any] | None:
    if item is None:
        return None
    return {
        "id": str(item.id),
        "quote_type": item.quote_type,
        "quote_round": item.quote_round,
        "order_quantity": item.order_quantity,
        "calc_quantity": item.calc_quantity,
        "batch_shipment_count": _num(item.batch_shipment_count),
        "port_misc_fee_cny": _num(item.port_misc_fee_cny),
        "test_fee_cny": _num(item.test_fee_cny),
        "misc_fee_cny": _num(item.misc_fee_cny),
        "included_other_fee_cny": _num(item.included_other_fee_cny),
        "pieces_per_card": item.pieces_per_card,
        "destination_port_count": item.destination_port_count,
        "exchange_rate": _num(item.exchange_rate),
        "net_profit_pct": _num(item.net_profit_pct),
        "commission_pct": _num(item.commission_pct),
        "selected_factory": item.selected_factory,
        "selected_factory_price_cny": _num(item.selected_factory_price_cny),
        "final_quote_usd": _num(item.final_quote_usd),
        "customer_target_price_usd": _num(item.customer_target_price_usd),
        "quote_vs_target_ratio": _num(item.quote_vs_target_ratio),
        "target_gap_cny": _num(item.target_gap_cny),
        "target_profit_value": _num(item.target_profit_value),
        "target_price_gap_usd": _num(item.target_price_gap_usd),
        "reverse_target_profit_value": _num(item.reverse_target_profit_value),
        "reverse_target_price_cny": _num(item.reverse_target_price_cny),
        "target_gross_profit_cny": _num(item.target_gross_profit_cny),
        "target_trade_amount_usd": _num(item.target_trade_amount_usd),
        "current_exchange_rate": _num(item.current_exchange_rate),
        "gross_profit_cny": _num(item.gross_profit_cny),
        "trade_amount_usd": _num(item.trade_amount_usd),
    }


def compute_price_analysis(cards: list[FactoryQuoteRecord]) -> dict[str, Any]:
    """
    只在同一轮、同币种、同单位的报价之间比较。
    多家并列最低价时 lowest_factories 是个列表；只有一家报价时第二低为空。
    """
    if not cards:
        return {
            "comparable": False, "reason": "no_quotes",
            "lowest_factories": [], "lowest_price": None,
            "second_lowest_factories": [], "second_lowest_price": None,
            "currency": None, "price_unit": None,
        }

    units = {(c.currency, c.price_unit) for c in cards}
    if len(units) > 1:
        return {
            "comparable": False, "reason": "mismatch",
            "lowest_factories": [], "lowest_price": None,
            "second_lowest_factories": [], "second_lowest_price": None,
            "currency": None, "price_unit": None,
        }

    priced = [c for c in cards if c.factory_price is not None]
    if not priced:
        return {
            "comparable": False, "reason": "no_price",
            "lowest_factories": [], "lowest_price": None,
            "second_lowest_factories": [], "second_lowest_price": None,
            "currency": cards[0].currency, "price_unit": cards[0].price_unit,
        }

    distinct_prices = sorted({float(c.factory_price) for c in priced})
    lowest_price = distinct_prices[0]
    lowest_factories = [c.factory_name for c in priced if float(c.factory_price) == lowest_price]

    remaining = [p for p in distinct_prices if p > lowest_price]
    if remaining:
        second_price = remaining[0]
        second_factories = [c.factory_name for c in priced if float(c.factory_price) == second_price]
    else:
        second_price = None
        second_factories = []

    return {
        "comparable": True, "reason": None,
        "lowest_factories": lowest_factories, "lowest_price": lowest_price,
        "second_lowest_factories": second_factories, "second_lowest_price": second_price,
        "currency": cards[0].currency, "price_unit": cards[0].price_unit,
    }


def _factory_label(c: FactoryQuoteRecord) -> str:
    return c.factory_name or "未命名工厂"


def build_first_round_factory_analysis(
    cards: list[FactoryQuoteRecord],
    quote_item: QuoteItem | None,
) -> dict[str, Any]:
    """
    第一轮 domestic 工厂价格分析。
    只比较有效报价（factory_price 非空）且币种/单位完全一致的记录；分析结果只
    用于展示，不写回数据库，不自动推荐或修改选用工厂。
    """
    quote_count = len(cards)
    valid = [c for c in cards if c.factory_price is not None]
    valid_count = len(valid)
    units = {(c.currency, c.price_unit) for c in valid}
    selected_factory = quote_item.selected_factory if quote_item else None
    selected_price = _num(quote_item.selected_factory_price_cny) if quote_item else None

    base = {
        "comparable": False,
        "reason": None,
        "quote_count": quote_count,
        "valid_quote_count": valid_count,
        "currency": None,
        "price_unit": None,
        "lowest_factories": [],
        "lowest_price": None,
        "highest_factories": [],
        "highest_price": None,
        "average_price": None,
        "second_lowest_factories": [],
        "second_lowest_price": None,
        "spread_amount": None,
        "spread_pct": None,
        "selected_factory": selected_factory,
        "selected_factory_price": selected_price,
        "selected_factory_rank": None,
        "selected_factory_gap_amount": None,
        "selected_factory_gap_pct": None,
        "selected_factory_is_lowest": None,
    }

    if not cards:
        return {**base, "reason": "no_quotes"}
    if not valid:
        return {**base, "reason": "no_price"}
    if len(units) > 1:
        return {**base, "reason": "mismatch"}

    prices = [float(c.factory_price) for c in valid]
    distinct_prices = sorted(set(prices))
    lowest_price = distinct_prices[0]
    highest_price = distinct_prices[-1]
    second_lowest_price = next((p for p in distinct_prices if p > lowest_price), None)
    spread_amount = highest_price - lowest_price if len(valid) > 1 else None
    spread_pct = spread_amount / lowest_price if spread_amount is not None and lowest_price else None

    selected_rank = None
    selected_gap_amount = None
    selected_gap_pct = None
    selected_is_lowest = None
    if selected_price is not None:
        selected_rank = 1 + sum(1 for p in distinct_prices if p < selected_price)
        selected_gap_amount = selected_price - lowest_price
        selected_gap_pct = selected_gap_amount / lowest_price if lowest_price else None
        selected_is_lowest = selected_price == lowest_price
    elif selected_factory:
        for c in valid:
            if (c.factory_name or "").strip() == selected_factory.strip():
                selected_price = float(c.factory_price)
                selected_rank = 1 + sum(1 for p in distinct_prices if p < selected_price)
                selected_gap_amount = selected_price - lowest_price
                selected_gap_pct = selected_gap_amount / lowest_price if lowest_price else None
                selected_is_lowest = selected_price == lowest_price
                break

    return {
        **base,
        "comparable": True,
        "reason": None,
        "currency": valid[0].currency,
        "price_unit": valid[0].price_unit,
        "lowest_factories": [_factory_label(c) for c in valid if float(c.factory_price) == lowest_price],
        "lowest_price": lowest_price,
        "highest_factories": [_factory_label(c) for c in valid if float(c.factory_price) == highest_price],
        "highest_price": highest_price,
        "average_price": sum(prices) / len(prices),
        "second_lowest_factories": (
            [_factory_label(c) for c in valid if float(c.factory_price) == second_lowest_price]
            if second_lowest_price is not None else []
        ),
        "second_lowest_price": second_lowest_price,
        "spread_amount": spread_amount,
        "spread_pct": spread_pct,
        "selected_factory_price": selected_price,
        "selected_factory_rank": selected_rank,
        "selected_factory_gap_amount": selected_gap_amount,
        "selected_factory_gap_pct": selected_gap_pct,
        "selected_factory_is_lowest": selected_is_lowest,
    }


def build_first_round_view(
    quote_item: QuoteItem | None,
    cards: list[FactoryQuoteRecord],
) -> dict[str, Any]:
    def sort_key(c: FactoryQuoteRecord):
        price = float(c.factory_price) if c.factory_price is not None else float("inf")
        return (price, c.factory_name or "", c.created_at)

    sorted_cards = sorted(cards, key=sort_key)
    analysis = build_first_round_factory_analysis(sorted_cards, quote_item)
    lowest = set(analysis["lowest_factories"]) if analysis["comparable"] else set()
    highest = set(analysis["highest_factories"]) if analysis["comparable"] else set()
    selected = (analysis["selected_factory"] or "").strip()
    details = []
    for c in sorted_cards:
        name = _factory_label(c)
        row = _brief(c)
        row["is_lowest"] = name in lowest
        row["is_highest"] = name in highest
        row["is_selected"] = bool(selected and name == selected)
        row["source"] = (
            f"{c.source_sheet}/{c.source_cell}"
            if c.source_sheet and c.source_cell
            else c.source_sheet or c.source_cell or "手动录入"
        )
        details.append(row)

    return {
        "quote_type": "domestic",
        "quote_round": 1,
        "quote_item": quote_item_brief(quote_item),
        "factory_analysis": analysis,
        "factory_quotes": details,
    }


def build_round_view(quote_type: str, quote_round: int, cards: list[FactoryQuoteRecord]) -> dict[str, Any]:
    """
    工厂1/工厂2 只是"按录入顺序展示"，不代表最低价或推荐工厂——
    排序规则：created_at 升序 → factory_name 升序。
    超过两家时，第3家起进入 other_factories（前端纵向展开，不横向加列）。
    """
    sorted_cards = sorted(cards, key=lambda c: (c.created_at, c.factory_name or ""))
    factory1 = sorted_cards[0] if len(sorted_cards) >= 1 else None
    factory2 = sorted_cards[1] if len(sorted_cards) >= 2 else None
    others = sorted_cards[2:]

    return {
        "quote_type": quote_type,
        "quote_round": quote_round,
        "factory1": _brief(factory1) if factory1 else None,
        "factory2": _brief(factory2) if factory2 else None,
        "other_factories": [_brief(c) for c in others],
        "price_analysis": compute_price_analysis(sorted_cards),
    }


def build_rounds(all_quotes: list[FactoryQuoteRecord]) -> list[dict[str, Any]]:
    by_round: dict[tuple[str, int], list[FactoryQuoteRecord]] = {}
    for q in all_quotes:
        if q.quote_round is None:
            continue
        by_round.setdefault((q.quote_type or "domestic", q.quote_round), []).append(q)

    order = {"domestic": 0, "overseas": 1}
    return [
        build_round_view(quote_type, round_no, cards)
        for (quote_type, round_no), cards in sorted(by_round.items(), key=lambda x: (order.get(x[0][0], 9), x[0][1]))
    ]


def find_applicable_factory_quote(all_quotes: list[FactoryQuoteRecord], factory_id) -> FactoryQuoteRecord | None:
    """适用工厂的"当前报价"——取该工厂在该询单下所有轮次报价里最新录入的一条。"""
    matching = [q for q in all_quotes if q.factory_id == factory_id]
    if not matching:
        return None
    return max(matching, key=lambda q: q.created_at)
