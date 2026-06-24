"""
单个订单的来龙去脉表（询单报价详情表）

只读汇总页的计算逻辑。唯一数据源是 factory_quote_records（按轮次填报的
工厂报价卡片，quote_round 非空的那部分）——这里不存储、不复制任何报价
数据，每次都是请求时实时从 factory_quote_records 重新计算。
"""
from __future__ import annotations

from typing import Any

from app.models.factory_quote_record import FactoryQuoteRecord


def _brief(r: FactoryQuoteRecord) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "factory_id": str(r.factory_id) if r.factory_id else None,
        "factory_name": r.factory_name,
        "factory_price": float(r.factory_price) if r.factory_price is not None else None,
        "currency": r.currency,
        "price_unit": r.price_unit,
        "remark": r.remark,
        "quoted_by": r.quoted_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
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


def build_round_view(quote_round: int, cards: list[FactoryQuoteRecord]) -> dict[str, Any]:
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
        "quote_round": quote_round,
        "factory1": _brief(factory1) if factory1 else None,
        "factory2": _brief(factory2) if factory2 else None,
        "other_factories": [_brief(c) for c in others],
        "price_analysis": compute_price_analysis(sorted_cards),
    }


def build_rounds(all_quotes: list[FactoryQuoteRecord]) -> list[dict[str, Any]]:
    by_round: dict[int, list[FactoryQuoteRecord]] = {}
    for q in all_quotes:
        if q.quote_round is None:
            continue
        by_round.setdefault(q.quote_round, []).append(q)

    return [build_round_view(round_no, cards) for round_no, cards in sorted(by_round.items())]


def find_applicable_factory_quote(all_quotes: list[FactoryQuoteRecord], factory_id) -> FactoryQuoteRecord | None:
    """适用工厂的"当前报价"——取该工厂在该询单下所有轮次报价里最新录入的一条。"""
    matching = [q for q in all_quotes if q.factory_id == factory_id]
    if not matching:
        return None
    return max(matching, key=lambda q: q.created_at)
