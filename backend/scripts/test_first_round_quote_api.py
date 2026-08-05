from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.models import Factory, FactoryQuoteRecord, Inquiry, OperationLog, QuoteItem

BASE = "http://127.0.0.1:8000/api/v1"


def h(username: str) -> dict[str, str]:
    return {"X-Username": username}


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        ids = (await db.execute(select(Inquiry.id).where(Inquiry.inquiry_no.like("FRAPI-%")))).scalars().all()
        if ids:
            await db.execute(delete(FactoryQuoteRecord).where(FactoryQuoteRecord.inquiry_id.in_(ids)))
            await db.execute(delete(QuoteItem).where(QuoteItem.inquiry_id.in_(ids)))
            await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(ids)))
            await db.execute(delete(Inquiry).where(Inquiry.id.in_(ids)))
        await db.execute(delete(Factory).where(Factory.factory_code.like("FRAPI%")))
        await db.commit()


async def seed() -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        await cleanup()
        f_low = Factory(
            id=uuid.uuid4(),
            factory_code="FRAPI001",
            factory_name="FRAPI低价风险工厂",
            factory_short_name="FRAPI低价风险工厂",
            risk_level="blocked",
            risk_notes="暂停合作：历史质量问题未关闭",
        )
        f_mid = Factory(id=uuid.uuid4(), factory_code="FRAPI002", factory_name="FRAPI稳价工厂", factory_short_name="FRAPI稳价工厂")
        db.add_all([f_low, f_mid])
        inq = Inquiry(
            id=uuid.uuid4(),
            inquiry_no="FRAPI-MAIN",
            customer_code="FRAPI-C",
            customer_short_name="FRAPI客户",
            group_name="A组",
            responsible_sales="sales_a1",
            product_category="泳装",
            product_name="FRAPI泳衣",
            series_name="FRAPI系列",
            quantity=100,
            inquiry_date=date(2026, 8, 5),
        )
        other = Inquiry(
            id=uuid.uuid4(),
            inquiry_no="FRAPI-B",
            group_name="B组",
            responsible_sales="sales_b1",
            product_name="FRAPI越权",
            quantity=50,
            inquiry_date=date(2026, 8, 5),
        )
        db.add_all([inq, other])
        db.add_all([
            FactoryQuoteRecord(id=uuid.uuid4(), factory_id=f_low.id, factory_name=f_low.factory_name, inquiry_id=inq.id, inquiry_no=inq.inquiry_no, quote_round=1, quote_type="domestic", currency="CNY", price_unit="件", factory_price=Decimal("10")),
            FactoryQuoteRecord(id=uuid.uuid4(), factory_id=f_mid.id, factory_name=f_mid.factory_name, inquiry_id=inq.id, inquiry_no=inq.inquiry_no, quote_round=1, quote_type="domestic", currency="CNY", price_unit="件", factory_price=Decimal("12")),
            FactoryQuoteRecord(id=uuid.uuid4(), factory_name="FRAPI海外不混", inquiry_id=inq.id, inquiry_no=inq.inquiry_no, quote_round=1, quote_type="overseas", currency="USD", price_unit="件", factory_price=Decimal("1")),
            FactoryQuoteRecord(id=uuid.uuid4(), factory_name="FRAPI第二轮不混", inquiry_id=inq.id, inquiry_no=inq.inquiry_no, quote_round=2, quote_type="domestic", currency="CNY", price_unit="件", factory_price=Decimal("1")),
        ])
        second_qi = QuoteItem(id=uuid.uuid4(), inquiry_id=inq.id, quote_type="domestic", quote_round=2)
        db.add(second_qi)
        await db.commit()
        return {"inquiry_id": str(inq.id), "other_id": str(other.id), "second_qi_id": str(second_qi.id)}


async def main() -> None:
    ids = await seed()
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        r = await client.post(f"{BASE}/inquiries/{ids['inquiry_id']}/quote-items", json={
            "order_quantity": 100,
            "selected_factory": "FRAPI稳价工厂",
            "selected_factory_price_cny": 12,
            "final_quote_usd": 2.5,
            "customer_target_price_usd": 2.1,
            "exchange_rate": 7,
            "commission_pct": 5,
        }, headers=h("sales_a1"))
        assert r.status_code == 201, r.text
        qi_id = r.json()["id"]

        r_viewer = await client.patch(f"{BASE}/quote-items/{qi_id}", json={"customer_target_price_usd": 2.2}, headers=h("viewer_a"))
        assert r_viewer.status_code == 403, r_viewer.text

        r_cross = await client.post(f"{BASE}/inquiries/{ids['other_id']}/quote-rounds/1/analyze", headers=h("sales_a1"))
        assert r_cross.status_code == 403, r_cross.text

        r_second = await client.patch(f"{BASE}/quote-items/{ids['second_qi_id']}", json={"customer_target_price_usd": 2.2}, headers=h("sales_a1"))
        assert r_second.status_code == 422, r_second.text

        r_analyze = await client.post(f"{BASE}/inquiries/{ids['inquiry_id']}/quote-rounds/1/analyze", headers=h("sales_a1"))
        assert r_analyze.status_code == 200, r_analyze.text
        data = r_analyze.json()
        fa = data["factory_price_analysis"]
        assert fa["quote_count"] == 2, fa
        assert fa["lowest_price"] == 10.0, fa
        assert fa["second_lowest_price"] == 12.0, fa
        assert data["factory_risk_analysis"]["risk_level"] == "blocked"
        assert "暂停合作" in data["factory_risk_analysis"]["risk_notes"]
        assert data["factory_selection_advice"]["triggered"] is True
        assert data["factory_selection_advice"]["attention_factory_names"] == ["FRAPI稳价工厂"]
        assert any("限制合作/暂停合作" in m["message"] for m in data["analysis_messages"])
        assert any("建议关注第二低报价工厂" in m["title"] for m in data["analysis_messages"])

    await cleanup()
    print("first round quote api tests passed")


if __name__ == "__main__":
    asyncio.run(main())
