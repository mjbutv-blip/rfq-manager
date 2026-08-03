from __future__ import annotations

import uuid
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.journey_service import build_first_round_view


def card(
    name: str,
    price: float | None,
    *,
    currency: str = "CNY",
    unit: str = "件",
    quote_type: str = "domestic",
    minute: int = 0,
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        factory_id=None,
        factory_name=name,
        factory_price=Decimal(str(price)) if price is not None else None,
        quote_type=quote_type,
        quote_round=1,
        currency=currency,
        price_unit=unit,
        remark=None,
        source_sheet=None,
        source_cell=None,
        quoted_by="tester",
        quoted_at=datetime(2026, 1, 1, 10, minute, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 1, 10, minute, tzinfo=timezone.utc),
    )


def quote_item(selected_factory: str | None = "B厂", selected_price: float | None = 11.0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        quote_type="domestic",
        quote_round=1,
        order_quantity=1000,
        calc_quantity=900,
        batch_shipment_count=Decimal("2"),
        port_misc_fee_cny=Decimal("1.2"),
        test_fee_cny=Decimal("200"),
        misc_fee_cny=Decimal("300"),
        included_other_fee_cny=Decimal("0"),
        pieces_per_card=2,
        destination_port_count=1,
        exchange_rate=Decimal("7.2"),
        net_profit_pct=Decimal("12.5"),
        commission_pct=Decimal("3"),
        selected_factory=selected_factory,
        selected_factory_price_cny=Decimal(str(selected_price)) if selected_price is not None else None,
        final_quote_usd=Decimal("2.5"),
        customer_target_price_usd=Decimal("2.3"),
        quote_vs_target_ratio=Decimal("1.0870"),
        target_gap_cny=Decimal("1.44"),
        target_profit_value=Decimal("0.95"),
        target_price_gap_usd=Decimal("0.2"),
        reverse_target_profit_value=Decimal("0.95"),
        reverse_target_price_cny=Decimal("16.56"),
        target_gross_profit_cny=Decimal("800"),
        target_trade_amount_usd=Decimal("2300"),
        current_exchange_rate=Decimal("7.3"),
        gross_profit_cny=Decimal("1200"),
        trade_amount_usd=Decimal("2500"),
    )


def approx(actual, expected):
    assert actual is not None
    assert abs(actual - expected) < 0.000001, (actual, expected)


def main():
    cards = [
        card("A厂", 10, minute=1),
        card("B厂", 11, minute=2),
        card("C厂", 13, minute=3),
    ]
    view = build_first_round_view(quote_item(), cards)
    q = view["quote_item"]
    assert q["order_quantity"] == 1000
    assert q["calc_quantity"] == 900
    assert q["batch_shipment_count"] == 2.0
    assert q["port_misc_fee_cny"] == 1.2
    assert q["test_fee_cny"] == 200.0
    assert q["misc_fee_cny"] == 300.0
    assert q["included_other_fee_cny"] == 0.0
    assert q["pieces_per_card"] == 2
    assert q["destination_port_count"] == 1
    assert q["customer_target_price_usd"] == 2.3
    assert q["quote_vs_target_ratio"] == 1.087
    assert q["target_gap_cny"] == 1.44
    assert q["target_profit_value"] == 0.95
    assert q["target_price_gap_usd"] == 0.2
    assert q["reverse_target_profit_value"] == 0.95
    assert q["reverse_target_price_cny"] == 16.56
    assert q["target_gross_profit_cny"] == 800.0
    assert q["target_trade_amount_usd"] == 2300.0
    assert q["gross_profit_cny"] == 1200.0

    a = view["factory_analysis"]
    assert a["quote_count"] == 3
    assert a["valid_quote_count"] == 3
    assert a["lowest_factories"] == ["A厂"]
    assert a["lowest_price"] == 10.0
    assert a["highest_factories"] == ["C厂"]
    assert a["highest_price"] == 13.0
    assert a["second_lowest_factories"] == ["B厂"]
    assert a["second_lowest_price"] == 11.0
    assert a["spread_amount"] == 3.0
    approx(a["spread_pct"], 0.3)
    assert a["selected_factory_rank"] == 2
    assert a["selected_factory_is_lowest"] is False
    assert a["selected_factory_gap_amount"] == 1.0
    approx(a["selected_factory_gap_pct"], 0.1)

    details = view["factory_quotes"]
    assert [d["factory_name"] for d in details] == ["A厂", "B厂", "C厂"]
    assert details[0]["is_lowest"] is True
    assert details[2]["is_highest"] is True
    assert details[1]["is_selected"] is True

    tied = build_first_round_view(quote_item("A厂", 10), [
        card("A厂", 10, minute=1),
        card("B厂", 10, minute=2),
        card("C厂", 12, minute=3),
    ])["factory_analysis"]
    assert tied["lowest_factories"] == ["A厂", "B厂"]
    assert tied["second_lowest_factories"] == ["C厂"]
    assert tied["selected_factory_is_lowest"] is True

    mismatch = build_first_round_view(quote_item(), [
        card("A厂", 10, currency="CNY"),
        card("B厂", 11, currency="USD"),
    ])["factory_analysis"]
    assert mismatch["comparable"] is False
    assert mismatch["reason"] == "mismatch"
    assert mismatch["lowest_price"] is None

    unit_mismatch = build_first_round_view(quote_item(), [
        card("A厂", 10, unit="件"),
        card("B厂", 11, unit="套"),
    ])["factory_analysis"]
    assert unit_mismatch["comparable"] is False
    assert unit_mismatch["reason"] == "mismatch"

    single = build_first_round_view(quote_item("A厂", 10), [card("A厂", 10)])["factory_analysis"]
    assert single["lowest_price"] == 10.0
    assert single["highest_price"] == 10.0
    assert single["second_lowest_price"] is None
    assert single["spread_amount"] is None
    assert single["spread_pct"] is None

    no_quotes = build_first_round_view(quote_item(), [])["factory_analysis"]
    assert no_quotes["reason"] == "no_quotes"
    assert no_quotes["quote_count"] == 0

    no_price = build_first_round_view(quote_item(), [card("A厂", None)])["factory_analysis"]
    assert no_price["reason"] == "no_price"
    assert no_price["valid_quote_count"] == 0

    domestic_only = [c for c in [card("国内A", 10), card("海外A", 1, quote_type="overseas")] if c.quote_type == "domestic"]
    separated = build_first_round_view(quote_item("国内A", 10), domestic_only)["factory_analysis"]
    assert separated["quote_count"] == 1
    assert separated["lowest_factories"] == ["国内A"]

    print("journey first round tests passed")


if __name__ == "__main__":
    main()
