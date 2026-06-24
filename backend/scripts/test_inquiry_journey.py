"""
单个订单的来龙去脉表（询单报价详情表）后端测试脚本

覆盖：
  1. 没有工厂报价时返回空状态（rounds=[]）
  2. 第1轮A/B两家正确填入工厂1/工厂2
  3. 第1轮A/B/C三家：A/B在主要位置，C出现在"其他工厂报价明细"
  4. 第2轮独立显示
  5. 最低工厂/最低价格计算正确
  6. 第二低工厂/第二低价格计算正确
  7. 相同最低价时并列处理正确
  8. 不同币种/单位时不自动比较
  9. 权限过滤正确（admin/group_leader/sales/viewer/越权/未登录）
  10. 询单字段改变后 journey 返回的数据立即反映新值（无服务端缓存问题）
  附加：适用工厂自动带出其最新报价

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_inquiry_journey.py
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from datetime import date
from sqlalchemy import delete, select, text

from app.database import AsyncSessionLocal
from app import crud
from app.models import Inquiry, OperationLog
from app.models.factory import Factory
from app.models.factory_quote_record import FactoryQuoteRecord

BASE = "http://127.0.0.1:8000/api/v1"
GREEN = "\033[0;32m"
RED   = "\033[0;31m"
CYAN  = "\033[0;36m"
BOLD  = "\033[1m"
NC    = "\033[0m"

_failures: list[str] = []


def ok(msg: str) -> None: print(f"{GREEN}  ✓ {msg}{NC}")
def fail(msg: str) -> None:
    print(f"{RED}  ✗ {msg}{NC}")
    _failures.append(msg)
def header(msg: str) -> None: print(f"\n{CYAN}{BOLD}=== {msg} ==={NC}")
def check(condition: bool, msg: str) -> None:
    ok(msg) if condition else fail(msg)


def h(username: str) -> dict:
    return {"X-Username": username}


async def _cleanup_db(db) -> None:
    inq_ids = (await db.execute(select(Inquiry.id).where(Inquiry.inquiry_no.like("JRNTEST-%")))).scalars().all()
    if inq_ids:
        await db.execute(delete(FactoryQuoteRecord).where(FactoryQuoteRecord.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(delete(Factory).where(Factory.factory_name == "JRN测试工厂"))
    await db.execute(text("delete from customers where customer_code in ('JRT01', 'JRT02')"))
    await db.commit()


async def seed() -> dict:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        inq_empty = await crud.create_inquiry(db, {
            "inquiry_no": "JRNTEST-EMPTY", "customer_code": "JRT01", "customer_short_name": "JRN测试客户A",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_name": "JRNTEST-EMPTY询单", "inquiry_date": date(2026, 12, 1),
        })
        inq_main = await crud.create_inquiry(db, {
            "inquiry_no": "JRNTEST-MAIN", "customer_code": "JRT01", "customer_short_name": "JRN测试客户A",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_name": "JRNTEST-MAIN询单", "inquiry_date": date(2026, 12, 1),
            "final_quote": 9.0,
        })
        inq_b = await crud.create_inquiry(db, {
            "inquiry_no": "JRNTEST-B1", "customer_code": "JRT02", "customer_short_name": "JRN测试客户B",
            "group_name": "B组", "responsible_sales": "sales_b1",
            "product_name": "JRNTEST-B1询单", "inquiry_date": date(2026, 12, 1),
        })
        await db.commit()
        return {"inq_empty": str(inq_empty.id), "inq_main": str(inq_main.id), "inq_b": str(inq_b.id)}


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def main() -> None:
    ids = await seed()
    inq_empty, inq_main, inq_b = ids["inq_empty"], ids["inq_main"], ids["inq_b"]

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        async def add_quote(inquiry_id: str, factory_name: str, price: float, round_no: int | None = None, **extra):
            body = {"factory_name": factory_name, "factory_price": price, **extra}
            if round_no is not None:
                body["quote_round"] = round_no
            return await client.post(f"{BASE}/inquiries/{inquiry_id}/factory-quotes", json=body, headers=h("sales_a1"))

        # ── 场景1：空状态 ────────────────────────────────────────────────────
        header("场景1：没有工厂报价时返回空状态")
        resp = await client.get(f"{BASE}/inquiries/{inq_empty}/journey", headers=h("sales_a1"))
        check(resp.status_code == 200, f"空询单 journey 接口返回200（实际 {resp.status_code}）")
        check(resp.json()["rounds"] == [], "没有报价时 rounds 为空列表")
        check(resp.json()["inquiry"]["inquiry_no"] == "JRNTEST-EMPTY", "询单基本信息正确返回")

        # ── 场景2-3：第1轮A/B/C三家 ───────────────────────────────────────────
        header("场景2-3：第1轮A/B两家正确填入工厂1/2，第3家C进入其他工厂明细")
        await add_quote(inq_main, "工厂A", 8.50, round_no=1)
        await add_quote(inq_main, "工厂B", 8.80, round_no=1)
        await add_quote(inq_main, "工厂C", 8.20, round_no=1)

        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        data = resp.json()
        round1 = next(r for r in data["rounds"] if r["quote_round"] == 1)
        check(round1["factory1"]["factory_name"] == "工厂A", f"工厂1=工厂A（按创建时间排序，实际 {round1['factory1']['factory_name']}）")
        check(round1["factory2"]["factory_name"] == "工厂B", f"工厂2=工厂B（实际 {round1['factory2']['factory_name']}）")
        check(len(round1["other_factories"]) == 1 and round1["other_factories"][0]["factory_name"] == "工厂C",
              f"工厂C出现在其他工厂报价明细（实际 {round1['other_factories']}）")

        # ── 场景5-6：最低/第二低 ──────────────────────────────────────────────
        header("场景5-6：最低工厂/价格、第二低工厂/价格计算正确")
        analysis = round1["price_analysis"]
        check(analysis["comparable"] is True, "同币种同单位可比较")
        check(analysis["lowest_factories"] == ["工厂C"] and analysis["lowest_price"] == 8.2,
              f"最低工厂=工厂C，最低价=8.2（实际 {analysis['lowest_factories']} / {analysis['lowest_price']}）")
        check(analysis["second_lowest_factories"] == ["工厂A"] and analysis["second_lowest_price"] == 8.5,
              f"第二低工厂=工厂A，第二低价=8.5（实际 {analysis['second_lowest_factories']} / {analysis['second_lowest_price']}）")

        # ── 场景4：第2轮独立显示 ──────────────────────────────────────────────
        header("场景4：第2轮独立显示")
        await add_quote(inq_main, "工厂A", 8.30)  # 不传 round，自动取下一轮
        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        data = resp.json()
        check(len(data["rounds"]) == 2, f"现在有2轮报价（实际 {len(data['rounds'])}）")
        round2 = next(r for r in data["rounds"] if r["quote_round"] == 2)
        check(round2["factory1"]["factory_name"] == "工厂A" and round2["factory1"]["factory_price"] == 8.3, "第2轮独立显示工厂A的新报价")
        check(round2["factory2"] is None, "第2轮只有1家工厂，工厂2为空")
        check(round2["price_analysis"]["second_lowest_price"] is None, "只有一家工厂时第二低价格为空")

        # ── 场景7：相同最低价并列 ─────────────────────────────────────────────
        header("场景7：相同最低价时并列处理正确")
        await add_quote(inq_main, "工厂D", 8.20, round_no=1)  # 与工厂C同价
        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        round1 = next(r for r in resp.json()["rounds"] if r["quote_round"] == 1)
        lowest = round1["price_analysis"]["lowest_factories"]
        check(set(lowest) == {"工厂C", "工厂D"}, f"并列最低价时全部标记（实际 {lowest}）")
        check(len(round1["other_factories"]) == 2, f"现在第1轮有4家工厂，2家进入其他明细（实际 {len(round1['other_factories'])}）")

        # ── 场景8：币种/单位不一致不比较 ───────────────────────────────────────
        header("场景8：不同币种或单位时不自动比较")
        # 把工厂D改成CNY
        d_id = next(c["id"] for c in [round1["factory1"], round1["factory2"], *round1["other_factories"]] if c and c["factory_name"] == "工厂D")
        await client.patch(f"{BASE}/factory-quotes/{d_id}", json={"currency": "CNY"}, headers=h("sales_a1"))
        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        round1 = next(r for r in resp.json()["rounds"] if r["quote_round"] == 1)
        check(round1["price_analysis"]["comparable"] is False and round1["price_analysis"]["reason"] == "mismatch",
              f"币种不一致时标记不可比较（实际 {round1['price_analysis']}）")
        # 改回USD，恢复，不影响后续场景
        await client.patch(f"{BASE}/factory-quotes/{d_id}", json={"currency": "USD"}, headers=h("sales_a1"))

        # ── 附加：适用工厂自动带出报价 ────────────────────────────────────────
        header("附加场景：适用工厂自动带出最新报价")
        r_factory = await client.post(f"{BASE}/factories", json={"factory_name": "JRN测试工厂"}, headers=h("demo_admin"))
        factory_id = r_factory.json()["id"]
        await add_quote(inq_main, None, 7.77, round_no=3, factory_id=factory_id)
        await client.patch(f"{BASE}/inquiries/{inq_main}", json={"applicable_factory_id": factory_id}, headers=h("demo_admin"))
        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        applicable = resp.json()["applicable_factory"]
        check(applicable is not None and applicable["factory_price"] == 7.77, f"适用工厂自动带出最新报价（实际 {applicable}）")
        check(applicable["factory_name"] == "JRN测试工厂", "适用工厂名称正确")

        # ── 场景10：询单字段改变后立即反映 ────────────────────────────────────
        header("场景10：询单字段改变后 journey 立即反映新值")
        await client.patch(f"{BASE}/inquiries/{inq_main}", json={"final_quote": 12.34, "order_status": "下单"}, headers=h("demo_admin"))
        resp = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a1"))
        check(resp.json()["inquiry"]["final_quote"] == 12.34, f"final_quote 立即反映新值（实际 {resp.json()['inquiry']['final_quote']}）")
        check(resp.json()["inquiry"]["order_status"] == "下单", "order_status 立即反映新值")

        # ── 场景9：权限测试 ──────────────────────────────────────────────────
        header("场景9：权限测试")
        r_viewer = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("viewer_a"))
        check(r_viewer.status_code == 200 and r_viewer.json()["can_edit"] is False, "viewer 可查看，can_edit=False")

        r_a2 = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("sales_a2"))
        check(r_a2.status_code == 403, f"sales_a2（与询单无关）越权返回403（实际 {r_a2.status_code}）")

        r_bleader = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("b_leader"))
        check(r_bleader.status_code == 403, f"B组组长越权访问A组询单返回403（实际 {r_bleader.status_code}）")

        r_aleader = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers=h("a_leader"))
        check(r_aleader.status_code == 200, f"A组组长可访问本组询单（实际 {r_aleader.status_code}）")

        r_admin = await client.get(f"{BASE}/inquiries/{inq_b}/journey", headers=h("demo_admin"))
        check(r_admin.status_code == 200, f"admin 可访问任意询单（实际 {r_admin.status_code}）")

        r_b1_own = await client.get(f"{BASE}/inquiries/{inq_b}/journey", headers=h("sales_b1"))
        check(r_b1_own.status_code == 200, f"sales_b1 可访问自己负责的B组询单（实际 {r_b1_own.status_code}）")

        r_401 = await client.get(f"{BASE}/inquiries/{inq_main}/journey", headers={"Authorization": "Bearer invalid-token-xyz"})
        check(r_401.status_code == 401, f"无效凭证返回401（实际 {r_401.status_code}）")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
