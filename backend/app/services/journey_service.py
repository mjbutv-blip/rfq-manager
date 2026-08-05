"""
单个订单的来龙去脉表（询单报价详情表）

只读汇总页的计算逻辑。唯一数据源是 factory_quote_records（按轮次填报的
工厂报价卡片，quote_round 非空的那部分）——这里不存储、不复制任何报价
数据，每次都是请求时实时从 factory_quote_records 重新计算。
"""
from __future__ import annotations

from decimal import Decimal
from statistics import median
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.factory import Factory
from app.models.factory_quote_record import FactoryQuoteRecord
from app.models.inquiry import Inquiry
from app.models.quote import QuoteItem

LOWEST_GAP_WARN_PCT = 0.15
LOWEST_GAP_STRONG_PCT = 0.25
LOWEST_RISK_SECOND_LOWEST_ATTENTION_PCT = 0.15
TARGET_GROSS_PROFIT_WARN_PCT = 0.15
MIN_HISTORY_SAMPLE_SIZE = 5
DOMESTIC = "domestic"


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


def _safe_pct(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _percentile(sorted_values: list[float], pct: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * pct
    lower = int(pos)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = pos - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def _factory_key(name: str | None) -> str:
    return (name or "").strip().lower()


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
        "median_price": None,
        "second_lowest_factories": [],
        "second_lowest_price": None,
        "highest_vs_lowest_pct": None,
        "second_lowest_vs_lowest_pct": None,
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
    second_lowest_vs_lowest_pct = (
        (second_lowest_price - lowest_price) / lowest_price
        if second_lowest_price is not None and lowest_price
        else None
    )

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
        "median_price": float(median(prices)),
        "second_lowest_factories": (
            [_factory_label(c) for c in valid if float(c.factory_price) == second_lowest_price]
            if second_lowest_price is not None else []
        ),
        "second_lowest_price": second_lowest_price,
        "highest_vs_lowest_pct": spread_pct,
        "second_lowest_vs_lowest_pct": second_lowest_vs_lowest_pct,
        "spread_amount": spread_amount,
        "spread_pct": spread_pct,
        "selected_factory_price": selected_price,
        "selected_factory_rank": selected_rank,
        "selected_factory_gap_amount": selected_gap_amount,
        "selected_factory_gap_pct": selected_gap_pct,
        "selected_factory_is_lowest": selected_is_lowest,
    }


async def _factory_for_quote(db: AsyncSession, quote: FactoryQuoteRecord | None) -> Factory | None:
    if quote is None:
        return None
    if quote.factory_id:
        return await db.get(Factory, quote.factory_id)
    name = (quote.factory_name or "").strip()
    if not name:
        return None
    return (await db.execute(
        select(Factory).where(or_(Factory.factory_name == name, Factory.factory_short_name == name))
    )).scalars().first()


def _lowest_quote(cards: list[FactoryQuoteRecord], analysis: dict[str, Any]) -> FactoryQuoteRecord | None:
    if not analysis.get("comparable") or analysis.get("lowest_price") is None:
        return None
    lowest_price = analysis["lowest_price"]
    valid = [c for c in cards if c.factory_price is not None]
    return next((c for c in valid if float(c.factory_price) == lowest_price), None)


async def build_factory_risk_analysis(
    db: AsyncSession,
    cards: list[FactoryQuoteRecord],
    factory_analysis: dict[str, Any],
) -> dict[str, Any]:
    lowest = _lowest_quote(cards, factory_analysis)
    factory = await _factory_for_quote(db, lowest)
    risk_level = factory.risk_level if factory else None
    risk_notes = (factory.risk_notes or factory.remark) if factory else None
    messages: list[dict[str, str]] = []
    if risk_level == "high":
        messages.append({
            "level": "warning",
            "title": "最低报价工厂风险记录",
            "message": "最低报价工厂存在高风险记录，请结合质量、交期、配合度和历史问题复核后再决定。",
        })
    if risk_level == "blocked":
        messages.append({
            "level": "error",
            "title": "最低报价工厂限制合作",
            "message": "最低报价工厂被标记为限制合作/暂停合作，不建议作为默认选用工厂。",
        })
    if risk_notes:
        messages.append({
            "level": "info",
            "title": "工厂问题备注",
            "message": risk_notes,
        })
    return {
        "lowest_factory_id": str(factory.id) if factory else None,
        "lowest_factory_name": factory.factory_short_name or factory.factory_name if factory else (lowest.factory_name if lowest else None),
        "risk_level": risk_level,
        "risk_notes": risk_notes,
        "messages": messages,
    }


def build_factory_gap_messages(factory_analysis: dict[str, Any]) -> list[dict[str, str]]:
    pct = factory_analysis.get("second_lowest_vs_lowest_pct")
    if pct is None:
        return []
    if pct >= LOWEST_GAP_STRONG_PCT:
        return [{
            "level": "error",
            "title": "最低报价差距明显",
            "message": "最低价明显低于其他工厂报价，存在报价口径不一致或漏算风险。建议不要只因最低价直接选用该工厂，可优先复核后再决定是否采用。",
        }]
    if pct >= LOWEST_GAP_WARN_PCT:
        return [{
            "level": "warning",
            "title": "最低报价差距较大",
            "message": "最低价与第二低价差距较大，建议复核最低报价的工艺、面料、数量、币种、单位、是否含税含运费，以及工厂是否理解需求一致。",
        }]
    return []


def build_factory_selection_advice(
    factory_analysis: dict[str, Any],
    factory_risk: dict[str, Any],
) -> dict[str, Any]:
    pct = factory_analysis.get("second_lowest_vs_lowest_pct")
    risk_level = factory_risk.get("risk_level")
    second_factories = factory_analysis.get("second_lowest_factories") or []
    lowest_factories = factory_analysis.get("lowest_factories") or []
    triggered = (
        pct is not None
        and pct >= LOWEST_RISK_SECOND_LOWEST_ATTENTION_PCT
        and risk_level in {"high", "blocked"}
        and bool(second_factories)
    )

    result = {
        "triggered": triggered,
        "threshold_pct": LOWEST_RISK_SECOND_LOWEST_ATTENTION_PCT,
        "gap_pct": pct,
        "lowest_factories": lowest_factories,
        "second_lowest_factories": second_factories,
        "risk_level": risk_level,
        "attention_factory_names": second_factories if triggered else [],
        "messages": [],
    }
    if not triggered:
        return result

    risk_text = "限制合作/暂停合作" if risk_level == "blocked" else "高风险"
    result["messages"] = [{
        "level": "error" if risk_level == "blocked" else "warning",
        "title": "建议关注第二低报价工厂",
        "message": (
            f"最低价与第二低价差距达到 {pct * 100:.1f}%，且最低报价工厂存在{risk_text}记录。"
            f"建议关注第二低报价工厂（{'、'.join(second_factories)}）作为更稳的备选方案，"
            "并复核最低价与第二低价工厂的工艺、面料、数量、币种、单位和费用口径；最终需要人工确认。"
        ),
    }]
    return result


def _historical_summary(
    values: list[float],
    current_lowest: float | None,
    selected_price: float | None,
    samples: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not values:
        return {
            "sample_count": 0,
            "status": "no_data",
            "message": "暂无足够历史价格数据，无法判断常规价位",
            "historical_lowest_price": None,
            "historical_highest_price": None,
            "historical_average_price": None,
            "historical_median_price": None,
            "normal_price_range_low": None,
            "normal_price_range_high": None,
            "current_lowest_below_range": None,
            "selected_price_above_range": None,
            "samples": [],
        }
    sorted_values = sorted(values)
    q25 = _percentile(sorted_values, 0.25)
    q75 = _percentile(sorted_values, 0.75)
    enough = len(values) >= MIN_HISTORY_SAMPLE_SIZE
    return {
        "sample_count": len(values),
        "status": "ok" if enough else "insufficient",
        "message": None if enough else "历史样本不足，仅供参考",
        "historical_lowest_price": sorted_values[0],
        "historical_highest_price": sorted_values[-1],
        "historical_average_price": sum(sorted_values) / len(sorted_values),
        "historical_median_price": float(median(sorted_values)),
        "normal_price_range_low": q25 if enough else None,
        "normal_price_range_high": q75 if enough else None,
        "current_lowest_below_range": (current_lowest < q25) if enough and current_lowest is not None and q25 is not None else None,
        "selected_price_above_range": (selected_price > q75) if enough and selected_price is not None and q75 is not None else None,
        "samples": samples or [],
    }


async def build_historical_price_reference(
    db: AsyncSession,
    inquiry: Inquiry,
    quote_item: QuoteItem | None,
    factory_analysis: dict[str, Any],
) -> dict[str, Any]:
    quote_type = DOMESTIC
    currency = factory_analysis.get("currency")
    price_unit = factory_analysis.get("price_unit")
    if not currency or not price_unit:
        return _historical_summary([], factory_analysis.get("lowest_price"), factory_analysis.get("selected_factory_price"))

    conditions = [
        FactoryQuoteRecord.factory_price.isnot(None),
        FactoryQuoteRecord.inquiry_id != inquiry.id,
        func.coalesce(FactoryQuoteRecord.quote_type, DOMESTIC) == quote_type,
        FactoryQuoteRecord.currency == currency,
        FactoryQuoteRecord.price_unit == price_unit,
    ]
    joined = select(FactoryQuoteRecord, Inquiry).join(
        Inquiry, FactoryQuoteRecord.inquiry_id == Inquiry.id
    ).where(*conditions)

    tiers: list[tuple[str, Any]] = [
        ("同客户 + 同品类 + 同品名 + 同系列", and_(
            Inquiry.customer_code == inquiry.customer_code,
            Inquiry.product_category == inquiry.product_category,
            Inquiry.product_name == inquiry.product_name,
            Inquiry.series_name == inquiry.series_name,
        )),
        ("同客户 + 同品类", and_(
            Inquiry.customer_code == inquiry.customer_code,
            Inquiry.product_category == inquiry.product_category,
        )),
        ("同品类 + 同报价类型", Inquiry.product_category == inquiry.product_category),
    ]
    if inquiry.product_name:
        tiers.append(("同产品关键词 + 同报价类型", Inquiry.product_name.ilike(f"%{inquiry.product_name}%")))

    chosen_tier = None
    values: list[float] = []
    for label, condition in tiers:
        rows = (await db.execute(joined.where(condition).limit(200))).all()
        values = [float(record.factory_price) for record, _inq in rows if record.factory_price is not None]
        if values:
            chosen_tier = label
            break
    sample_rows = sorted(rows, key=lambda row: (float(row[0].factory_price), row[1].inquiry_date or row[0].created_at), reverse=False)[:20] if values else []
    samples = [
        {
            "inquiry_id": str(sample_inq.id),
            "inquiry_no": sample_inq.inquiry_no,
            "customer_code": sample_inq.customer_code,
            "customer_short_name": sample_inq.customer_short_name,
            "product_category": sample_inq.product_category,
            "product_name": sample_inq.product_name,
            "series_name": sample_inq.series_name,
            "factory_name": record.factory_name,
            "factory_price": _num(record.factory_price),
            "currency": record.currency,
            "price_unit": record.price_unit,
            "quote_round": record.quote_round,
            "quote_type": record.quote_type or DOMESTIC,
            "quote_date": record.quote_date.isoformat() if record.quote_date else None,
            "inquiry_date": sample_inq.inquiry_date.isoformat() if sample_inq.inquiry_date else None,
            "order_status": sample_inq.order_status,
        }
        for record, sample_inq in sample_rows
    ]
    summary = _historical_summary(values, factory_analysis.get("lowest_price"), factory_analysis.get("selected_factory_price"), samples)
    summary["match_rule"] = chosen_tier
    summary["currency"] = currency
    summary["price_unit"] = price_unit
    return summary


def build_customer_target_price_analysis(quote_item: QuoteItem | None) -> dict[str, Any]:
    q = quote_item
    target = _num(q.customer_target_price_usd) if q else None
    final_quote = _num(q.final_quote_usd) if q else None
    factory_price = _num(q.selected_factory_price_cny) if q else None
    exchange_rate = (_num(q.current_exchange_rate) or _num(q.exchange_rate)) if q else None
    qty = (q.order_quantity or q.calc_quantity) if q else None
    port_misc = _num(q.port_misc_fee_cny) or 0 if q else 0
    test_fee = _num(q.test_fee_cny) or 0 if q else 0
    misc_fee = _num(q.misc_fee_cny) or 0 if q else 0
    commission_pct = (_num(q.commission_pct) or 0) / 100 if q else 0
    diff = target - final_quote if target is not None and final_quote is not None else None
    diff_pct = _safe_pct(diff, final_quote)
    required_discount_pct = _safe_pct(final_quote - target, final_quote) if target is not None and final_quote is not None and target < final_quote else 0 if target is not None and final_quote is not None else None
    missing = [
        label for label, value in (
            ("客人目标价", target),
            ("工厂价", factory_price),
            ("汇率", exchange_rate),
            ("数量", qty),
        ) if value is None
    ]
    target_sales_usd = target * qty if target is not None and qty is not None else None
    target_sales_cny = target_sales_usd * exchange_rate if target_sales_usd is not None and exchange_rate is not None else None
    target_cost_cny = (factory_price + port_misc + test_fee + misc_fee) * qty if factory_price is not None and qty is not None else None
    target_commission_cny = target_sales_cny * commission_pct if target_sales_cny is not None else None
    target_gross_profit_cny = (
        target_sales_cny - target_cost_cny - target_commission_cny
        if target_sales_cny is not None and target_cost_cny is not None and target_commission_cny is not None
        else None
    )
    target_gross_profit_rate = _safe_pct(target_gross_profit_cny, target_sales_cny)
    has_profit = target_gross_profit_cny > 0 if target_gross_profit_cny is not None else None

    messages: list[dict[str, str]] = []
    if missing:
        messages.append({
            "level": "warning",
            "title": "目标价测算缺字段",
            "message": "缺少工厂价/汇率/数量，无法完整测算目标价利润",
        })
    elif target is not None and final_quote is not None and target >= final_quote:
        messages.append({
            "level": "info",
            "title": "目标价价格压力较小",
            "message": "客人目标价不低于当前报价，价格压力较小。请确认目标价单位和币种是否一致。",
        })
    elif target_gross_profit_rate is not None and target_gross_profit_rate >= TARGET_GROSS_PROFIT_WARN_PCT:
        messages.append({
            "level": "success",
            "title": "目标价仍有利润空间",
            "message": "按当前工厂价和费用测算，客人目标价仍有一定利润空间，可结合客户重要性和订单量考虑是否接受或接近目标价。",
        })
    elif target_gross_profit_cny is not None and target_gross_profit_cny > 0:
        messages.append({
            "level": "warning",
            "title": "目标价利润较薄",
            "message": "客人目标价下利润较薄，建议复核工厂价格、费用、佣金和订单量，或在下一轮报价中争取工厂降价。",
        })
    elif target_gross_profit_cny is not None:
        messages.append({
            "level": "error",
            "title": "目标价可能亏损",
            "message": "按当前数据测算，客人目标价可能导致亏损。建议不要直接接受，需重新谈工厂价或调整报价条件。",
        })

    return {
        "customer_target_price_usd": target,
        "final_quote_usd": final_quote,
        "target_vs_current_diff": diff,
        "target_vs_current_diff_pct": diff_pct,
        "target_sales_amount_usd": target_sales_usd,
        "target_gross_profit_cny": target_gross_profit_cny,
        "target_gross_profit_rate": target_gross_profit_rate,
        "target_has_profit": has_profit,
        "required_discount_pct": required_discount_pct,
        "missing_fields": missing,
        "messages": messages,
    }


def build_rule_analysis_messages(
    factory_analysis: dict[str, Any],
    factory_risk: dict[str, Any],
    factory_selection_advice: dict[str, Any],
    historical: dict[str, Any],
    target: dict[str, Any],
) -> list[dict[str, Any]]:
    missing_confirm = []
    if not factory_analysis.get("comparable"):
        missing_confirm.append("币种、单位或工厂报价完整性")
    if target.get("missing_fields"):
        missing_confirm.extend(target["missing_fields"])
    if historical.get("status") in {"no_data", "insufficient"}:
        missing_confirm.append("历史价格样本")
    sections = [
        {
            "title": "工厂报价概况",
            "items": [
                f"参与报价工厂 {factory_analysis.get('quote_count', 0)} 家，有效报价 {factory_analysis.get('valid_quote_count', 0)} 条。",
                f"最低报价为 {factory_analysis.get('lowest_price') if factory_analysis.get('lowest_price') is not None else '—'}，第二低报价为 {factory_analysis.get('second_lowest_price') if factory_analysis.get('second_lowest_price') is not None else '—'}。",
            ],
        },
        {
            "title": "价格差异与风险",
            "items": [m["message"] for m in build_factory_gap_messages(factory_analysis)] or ["当前结构化数据未触发最低价差距阈值；仍需人工确认报价口径一致。"],
        },
        {
            "title": "选用工厂关注点",
            "items": [
                "当前选用工厂是否为最低价：" + ("是" if factory_analysis.get("selected_factory_is_lowest") else "否" if factory_analysis.get("selected_factory_is_lowest") is False else "—"),
                f"选用工厂比最低价高 {factory_analysis.get('selected_factory_gap_amount') if factory_analysis.get('selected_factory_gap_amount') is not None else '—'}。",
                *(m["message"] for m in factory_risk.get("messages", [])),
                *(m["message"] for m in factory_selection_advice.get("messages", [])),
            ],
        },
        {
            "title": "客人目标价可行性",
            "items": [m["message"] for m in target.get("messages", [])] or ["未录入客人目标价或关键参数不足，暂不强行判断。"],
        },
        {
            "title": "下一轮报价建议关注事项",
            "items": [
                "建议关注工厂是否按同一工艺、面料、数量、币种、单位和费用口径报价。",
                "如目标价压力较大，下一轮可优先复核工厂价、港杂费、测试费、杂费、佣金和利润值。",
            ],
        },
        {
            "title": "需要人工确认的数据",
            "items": sorted(set(missing_confirm)) or ["工厂报价是否含税含运费、数量口径、客人目标价币种和单位。"],
        },
    ]
    return sections


async def build_first_round_analysis_bundle(
    db: AsyncSession,
    inquiry: Inquiry,
    quote_item: QuoteItem | None,
    cards: list[FactoryQuoteRecord],
) -> dict[str, Any]:
    sorted_cards = sorted(cards, key=lambda c: (float(c.factory_price) if c.factory_price is not None else float("inf"), c.factory_name or "", c.created_at))
    factory_analysis = build_first_round_factory_analysis(sorted_cards, quote_item)
    factory_risk = await build_factory_risk_analysis(db, sorted_cards, factory_analysis)
    factory_selection_advice = build_factory_selection_advice(factory_analysis, factory_risk)
    historical = await build_historical_price_reference(db, inquiry, quote_item, factory_analysis)
    target = build_customer_target_price_analysis(quote_item)
    analysis_messages = [
        *build_factory_gap_messages(factory_analysis),
        *factory_risk["messages"],
        *factory_selection_advice["messages"],
        *target["messages"],
    ]
    ai_prompt_data = {
        "source": "rule_based_first_version",
        "factory_price_analysis": factory_analysis,
        "factory_risk_analysis": factory_risk,
        "factory_selection_advice": factory_selection_advice,
        "historical_price_reference": historical,
        "customer_target_price_analysis": target,
    }
    return {
        "factory_price_analysis": factory_analysis,
        "factory_risk_analysis": factory_risk,
        "factory_selection_advice": factory_selection_advice,
        "historical_price_reference": historical,
        "customer_target_price_analysis": target,
        "ai_analysis_prompt_data": ai_prompt_data,
        "ai_analysis_messages": build_rule_analysis_messages(factory_analysis, factory_risk, factory_selection_advice, historical, target),
        "analysis_messages": analysis_messages,
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
