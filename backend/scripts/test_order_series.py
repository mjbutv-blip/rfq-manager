from __future__ import annotations

import sys
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.order_group_service import build_order_group_analysis
from app.services.order_series_service import _series_summary


def inq(no: str, qty: int):
    return SimpleNamespace(
        id=uuid.uuid4(),
        inquiry_no=no,
        customer_order_no=None,
        product_name=no + "品名",
        quantity=qty,
        order_status=None,
        final_quote=None,
        factory_price=None,
        trade_amount=None,
    )


def qitem(inquiry_id, selected_factory="F1", selected_price=50, qty=100):
    return SimpleNamespace(
        inquiry_id=inquiry_id,
        quote_type="domestic",
        quote_round=1,
        order_quantity=qty,
        final_quote_usd=Decimal("10"),
        current_exchange_rate=Decimal("7"),
        exchange_rate=None,
        port_misc_fee_cny=None,
        commission_pct=None,
        selected_factory=selected_factory,
        selected_factory_price_cny=Decimal(str(selected_price)),
        gross_profit_cny=Decimal(str((70 - selected_price) * qty)),
        trade_amount_usd=Decimal(str(qty * 10)),
    )


def quote(inquiry_id, factory, price, *, quote_type="domestic", currency="CNY", unit="件"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        quote_type=quote_type,
        quote_round=1,
        factory_name=factory,
        factory_price=Decimal(str(price)),
        currency=currency,
        price_unit=unit,
    )


def test_series_summary_and_grouping():
    a = inq("BTKS007", 100)
    b = inq("BTKS008", 200)
    c = inq("BTKS009", 300)
    quote_items = [qitem(a.id, "F1", 50, 100), qitem(b.id, "F2", 45, 200), qitem(c.id, "F2", 40, 300)]
    quotes = [
        quote(a.id, "F1", 50),
        quote(b.id, "F2", 45),
        quote(c.id, "F2", 40),
        quote(c.id, "海外", 1, quote_type="overseas"),
    ]
    analysis = build_order_group_analysis([a, b, c], quote_items, quotes)
    group = SimpleNamespace(id=uuid.uuid4())
    group_items = [SimpleNamespace(inquiry_no="BTKS008"), SimpleNamespace(inquiry_no="BTKS009")]
    summary = _series_summary(analysis, [(group, group_items)])
    assert summary["total_quantity"] == 600
    assert summary["trade_amount_usd"] == 6000
    assert summary["order_group_count"] == 1
    assert summary["ungrouped_inquiry_nos"] == ["BTKS007"]
    assert summary["selected_factory_count"] == 2
    assert summary["missing_quote_inquiries"] == []


def main():
    test_series_summary_and_grouping()
    print("order series tests passed")


if __name__ == "__main__":
    main()
