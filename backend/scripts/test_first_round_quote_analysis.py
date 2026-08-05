from __future__ import annotations

import asyncio
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.journey_service import (  # noqa: E402
    _historical_summary,
    build_customer_target_price_analysis,
    build_factory_gap_messages,
    build_factory_risk_analysis,
    build_factory_selection_advice,
    build_first_round_factory_analysis,
)


def quote(factory, price, *, round_no=1, quote_type="domestic", currency="CNY", unit="件", factory_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        factory_id=factory_id,
        factory_name=factory,
        factory_price=Decimal(str(price)) if price is not None else None,
        quote_round=round_no,
        quote_type=quote_type,
        currency=currency,
        price_unit=unit,
        remark=None,
        source_sheet=None,
        source_cell=None,
        quoted_by=None,
        quoted_at=None,
        created_at=None,
    )


def qitem(**overrides):
    data = {
        "selected_factory": "工厂B",
        "selected_factory_price_cny": Decimal("115"),
        "order_quantity": 100,
        "calc_quantity": None,
        "final_quote_usd": Decimal("20"),
        "customer_target_price_usd": Decimal("18"),
        "current_exchange_rate": Decimal("7"),
        "exchange_rate": None,
        "port_misc_fee_cny": Decimal("1"),
        "test_fee_cny": Decimal("0.5"),
        "misc_fee_cny": Decimal("0.5"),
        "commission_pct": Decimal("5"),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def approx(actual, expected):
    assert actual is not None
    assert abs(actual - expected) < 0.000001, (actual, expected)


def test_factory_analysis_round_and_type_filter():
    cards = [
        quote("工厂A", 100),
        quote("工厂B", 115),
        quote("工厂C", 140),
        quote("第二轮低价", 1, round_no=2),
        quote("海外低价", 1, quote_type="overseas"),
    ]
    scoped = [c for c in cards if c.quote_round == 1 and (c.quote_type or "domestic") == "domestic"]
    analysis = build_first_round_factory_analysis(scoped, qitem())
    assert analysis["quote_count"] == 3
    assert analysis["valid_quote_count"] == 3
    assert analysis["lowest_factories"] == ["工厂A"]
    assert analysis["second_lowest_factories"] == ["工厂B"]
    assert analysis["highest_factories"] == ["工厂C"]
    approx(analysis["average_price"], 118.33333333333333)
    approx(analysis["median_price"], 115)
    approx(analysis["second_lowest_vs_lowest_pct"], 0.15)
    approx(analysis["highest_vs_lowest_pct"], 0.4)
    assert analysis["selected_factory_rank"] == 2
    assert analysis["selected_factory_is_lowest"] is False
    approx(analysis["selected_factory_gap_amount"], 15)
    approx(analysis["selected_factory_gap_pct"], 0.15)


def test_mismatch_stable():
    analysis = build_first_round_factory_analysis(
        [quote("工厂A", 100, currency="CNY"), quote("工厂B", 15, currency="USD")],
        qitem(),
    )
    assert analysis["comparable"] is False
    assert analysis["reason"] == "mismatch"
    assert analysis["lowest_price"] is None


def test_gap_messages():
    warn = build_first_round_factory_analysis([quote("A", 100), quote("B", 115)], qitem(selected_factory="A", selected_factory_price_cny=Decimal("100")))
    strong = build_first_round_factory_analysis([quote("A", 100), quote("B", 125)], qitem(selected_factory="A", selected_factory_price_cny=Decimal("100")))
    assert "差距较大" in build_factory_gap_messages(warn)[0]["message"]
    assert "明显低于其他工厂报价" in build_factory_gap_messages(strong)[0]["message"]


class FakeDb:
    def __init__(self, factory):
        self.factory = factory

    async def get(self, model, id_):
        return self.factory


async def test_factory_risk_messages():
    factory_id = uuid.uuid4()
    analysis = build_first_round_factory_analysis([quote("风险工厂", 100, factory_id=factory_id), quote("B", 130)], qitem())
    high_factory = SimpleNamespace(id=factory_id, factory_name="风险工厂", factory_short_name=None, risk_level="high", risk_notes="历史交期不稳定", remark="旧备注")
    high = await build_factory_risk_analysis(FakeDb(high_factory), [quote("风险工厂", 100, factory_id=factory_id), quote("B", 130)], analysis)
    assert any("高风险记录" in m["message"] for m in high["messages"])
    assert any("历史交期不稳定" in m["message"] for m in high["messages"])
    blocked_factory = SimpleNamespace(id=factory_id, factory_name="风险工厂", factory_short_name=None, risk_level="blocked", risk_notes=None, remark=None)
    blocked = await build_factory_risk_analysis(FakeDb(blocked_factory), [quote("风险工厂", 100, factory_id=factory_id), quote("B", 130)], analysis)
    assert any("限制合作/暂停合作" in m["message"] for m in blocked["messages"])


async def test_factory_selection_advice():
    factory_id = uuid.uuid4()
    cards = [quote("风险工厂", 100, factory_id=factory_id), quote("第二低工厂", 120)]
    analysis = build_first_round_factory_analysis(cards, qitem(selected_factory="风险工厂", selected_factory_price_cny=Decimal("100")))
    high_factory = SimpleNamespace(id=factory_id, factory_name="风险工厂", factory_short_name=None, risk_level="high", risk_notes=None, remark=None)
    risk = await build_factory_risk_analysis(FakeDb(high_factory), cards, analysis)
    advice = build_factory_selection_advice(analysis, risk)
    assert advice["triggered"] is True
    assert advice["attention_factory_names"] == ["第二低工厂"]
    assert "建议关注第二低报价工厂" in advice["messages"][0]["title"]
    assert "最终需要人工确认" in advice["messages"][0]["message"]

    low_risk = {**risk, "risk_level": "low"}
    assert build_factory_selection_advice(analysis, low_risk)["triggered"] is False
    small_gap = build_first_round_factory_analysis([quote("风险工厂", 100, factory_id=factory_id), quote("第二低工厂", 110)], qitem())
    assert build_factory_selection_advice(small_gap, risk)["triggered"] is False


def test_historical_summary():
    insufficient = _historical_summary([90, 100, 110], current_lowest=80, selected_price=120)
    assert insufficient["status"] == "insufficient"
    assert insufficient["normal_price_range_low"] is None
    enough = _historical_summary([80, 90, 100, 110, 120, 130], current_lowest=70, selected_price=140)
    assert enough["status"] == "ok"
    approx(enough["normal_price_range_low"], 92.5)
    approx(enough["normal_price_range_high"], 117.5)
    assert enough["current_lowest_below_range"] is True
    assert enough["selected_price_above_range"] is True


def test_target_price_messages():
    pressure_small = build_customer_target_price_analysis(qitem(customer_target_price_usd=Decimal("21")))
    assert "价格压力较小" in pressure_small["messages"][0]["message"]
    profitable = build_customer_target_price_analysis(qitem(customer_target_price_usd=Decimal("18"), selected_factory_price_cny=Decimal("80")))
    assert profitable["target_has_profit"] is True
    assert "利润空间" in profitable["messages"][0]["message"]
    thin = build_customer_target_price_analysis(qitem(customer_target_price_usd=Decimal("18")))
    assert thin["target_has_profit"] is True
    assert "利润较薄" in thin["messages"][0]["message"]
    loss = build_customer_target_price_analysis(qitem(customer_target_price_usd=Decimal("16")))
    assert loss["target_has_profit"] is False
    assert "可能导致亏损" in loss["messages"][0]["message"]
    missing = build_customer_target_price_analysis(qitem(selected_factory_price_cny=None))
    assert missing["target_gross_profit_cny"] is None
    assert "缺少工厂价/汇率/数量" in missing["messages"][0]["message"]


def main():
    test_factory_analysis_round_and_type_filter()
    test_mismatch_stable()
    test_gap_messages()
    asyncio.run(test_factory_risk_messages())
    asyncio.run(test_factory_selection_advice())
    test_historical_summary()
    test_target_price_messages()
    print("first round quote analysis tests passed")


if __name__ == "__main__":
    main()
