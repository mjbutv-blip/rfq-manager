from __future__ import annotations

import sys
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.base_inquiry_import_service import BaseImportRow, _detect_order_group_candidates, _parse_workbook
from app.services.order_group_service import build_order_group_analysis


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
        gross_profit_cny=None,
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


def approx(actual, expected):
    assert actual is not None
    assert abs(actual - expected) < 0.000001, (actual, expected)


def test_candidate_detection():
    rows = [
        BaseImportRow("总表", 5, "BTKU1005", document_series_name="TK-BTKU1005-1010", order_group_marker="这两个单是一套"),
        BaseImportRow("总表", 6, "BTKU1010", document_series_name="TK-BTKU1005-1010", order_group_marker="这两个单是一套"),
        BaseImportRow("总表", 9, "BTKU1006"),
    ]
    candidates = _detect_order_group_candidates(rows, {("总表", 5): None, ("总表", 6): None, ("总表", 9): None})
    assert len(candidates) == 1
    assert candidates[0]["inquiry_nos"] == ["BTKU1005", "BTKU1010"]
    assert candidates[0]["group_marker"] == "这两个单是一套"
    assert candidates[0]["document_series_name"] == "TK-BTKU1005-1010"
    assert candidates[0]["default_confirmed"] is True


def test_visual_detection_is_uncertain():
    rows = [
        BaseImportRow("总表", 5, "BTKU1005", document_series_name="TK-BTKU1005-1010"),
        BaseImportRow("总表", 6, "BTKU1010", document_series_name="TK-BTKU1005-1010"),
    ]
    candidates = _detect_order_group_candidates(rows, {("总表", 5): "00D9EAD3", ("总表", 6): "00D9EAD3"})
    assert len(candidates) == 1
    assert candidates[0]["status"] == "group_candidate_uncertain"
    assert candidates[0]["default_confirmed"] is False


def test_tk_btks_sample_file_detection():
    path = Path("/Users/mj/Desktop/TK各种报价单/TK SS27 泳装报价单/TK-BTKS007-010单报价单.xls")
    if not path.exists():
        print("sample file not found, skip")
        return
    rows, sheet_stats, candidates, document_series = _parse_workbook(path.read_bytes(), "TK", path.name)
    parsed = [r for r in rows if r.source_sheet == "总表" and r.inquiry_no]
    assert [r.inquiry_no for r in parsed] == ["BTKS007", "BTKS008", "BTKS009", "BTKS010"]
    assert all(r.document_series_name == "TK-BTKS007-010" for r in parsed)
    assert sheet_stats["总表"]["document_series_name"] == "TK-BTKS007-010"
    assert document_series[0]["inquiry_nos"] == ["BTKS007", "BTKS008", "BTKS009", "BTKS010"]
    reliable = [c for c in candidates if c["status"] == "pending_confirm"]
    assert len(reliable) == 1
    assert reliable[0]["inquiry_nos"] == ["BTKS008", "BTKS009"]
    assert reliable[0]["group_marker"] == "这两个单是一套"


def test_scenarios_and_domestic_filter():
    a = inq("A", 100)
    b = inq("B", 200)
    quote_items = [qitem(a.id, "F1", 50, 100), qitem(b.id, "F1", 40, 200)]
    quotes = [
        quote(a.id, "F1", 50),
        quote(a.id, "F2", 55),
        quote(a.id, "海外低价", 1, quote_type="overseas"),
        quote(b.id, "F1", 40),
        quote(b.id, "F2", 35),
    ]
    analysis = build_order_group_analysis([a, b], quote_items, quotes)
    scenario_a = analysis["scenarios"]["lowest_each"]
    assert scenario_a["factory_count"] == 2
    assert scenario_a["factory_cost_cny"] == 12000
    assert scenario_a["gross_profit_cny"] == 9000
    assert analysis["inquiries"][0]["lowest_factory"] == "F1"
    assert analysis["inquiries"][1]["lowest_factory"] == "F2"
    unified = analysis["scenarios"]["unified_factory"]
    assert [s["unified_factory"] for s in unified] == ["F2", "F1"]
    approx(unified[0]["gross_profit_cny"], 8500)
    scenario_c = analysis["scenarios"]["current_selected"]
    assert scenario_c["factory_count"] == 1
    approx(scenario_c["gross_profit_cny"], 8000)


def test_missing_and_mismatch_stable():
    a = inq("A", 100)
    b = inq("B", 200)
    analysis = build_order_group_analysis(
        [a, b],
        [qitem(a.id, "F1", 50, 100)],
        [quote(a.id, "F1", 50, currency="CNY"), quote(a.id, "F2", 8, currency="USD")],
    )
    assert "A 第一轮国内报价币种或单位不一致，暂不比较" in analysis["warnings"]
    assert "B 第一轮国内没有有效工厂报价" in analysis["warnings"]
    assert analysis["scenarios"]["lowest_each"]["gross_profit_cny"] is None


def main():
    test_candidate_detection()
    test_visual_detection_is_uncertain()
    test_tk_btks_sample_file_detection()
    test_scenarios_and_domestic_filter()
    test_missing_and_mismatch_stable()
    print("order group tests passed")


if __name__ == "__main__":
    main()
