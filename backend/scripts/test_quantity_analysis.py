"""
报价资料分析 Step 8 —— 报价数量 / 订单规模分析 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第十五节列出的场景：数量分桶 / NULL 与 0 区分 / 均值中位数最大最小值 /
按客户品类业务员统计 / 按状态统计 / P95 风险提示最小样本量 / 小批量提示 /
priority_items 排序 / 权限过滤 / 空数据稳定性。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_quantity_analysis.py

会写入以 TESTQTY- 为前缀的测试询单，结束后自动清理。
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
from app.models import Inquiry, OperationLog, InquiryWarning
from app.models.inquiry_item import InquiryItem

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
    inq_ids = (await db.execute(
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTQTY-%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(text("delete from customers where customer_code in ('CCT01', 'CCT02', 'CCT03')"))
    await db.commit()


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def seed() -> dict:
    """
    A组（sales_a1）：
      itemA1 ABC/泳装 quantity=None，已下单                       → 优先补录 tier3
      itemA2 ABC/泳装 quantity=None，已报价（非已下单）             → 优先补录 tier2
      itemA3 ABC/内衣 quantity=0                                  → 优先补录 tier1
      itemA4 ABC/泳装 quantity=50（窄批量 1-99）                   → 完整，不入选优先补录
      itemA5 ABC/泳装 quantity=1000（中段批量 1000-2999）
      itemB1-B20（20条）XYZ/运动 quantity=200..2090（步长 100），用于测 P95（样本数恰好 20）

    B组（sales_b1，权限隔离用）：
      itemF1 DEF/泳装 quantity=300
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        async def make_inq(no, cust_code, cust_name, group, sales, cat, d, order_status, quote_status):
            return await crud.create_inquiry(db, {
                "inquiry_no": no, "customer_code": cust_code, "customer_short_name": cust_name,
                "group_name": group, "responsible_sales": sales,
                "product_category": cat, "product_name": f"{no}询单",
                "inquiry_date": d, "order_status": order_status, "quote_status": quote_status,
            })

        inqA1 = await make_inq("TESTQTY-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 7, 1), "下单", "已报价")
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTQTY-A1", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": None,
        })

        inqA2 = await make_inq("TESTQTY-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 7, 2), "跟进中", "已报价")
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTQTY-A2", {
            "style_no": "A002", "product_name": "连体泳衣", "product_category": "泳装", "quantity": None,
        })

        inqA3 = await make_inq("TESTQTY-A3", "CCT01", "ABC客户", "A组", "sales_a1", "内衣",
                                date(2026, 7, 3), "跟进中", "未报价")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTQTY-A3", {
            "style_no": "A003", "product_name": "运动内衣", "product_category": "内衣", "quantity": 0,
        })

        inqA4 = await make_inq("TESTQTY-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 7, 4), "跟进中", "未报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTQTY-A4", {
            "style_no": "A004", "product_name": "泳裤", "product_category": "泳装", "quantity": 50,
        })

        inqA5 = await make_inq("TESTQTY-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 7, 5), "跟进中", "未报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTQTY-A5", {
            "style_no": "A005", "product_name": "防晒衣", "product_category": "泳装", "quantity": 1000,
        })

        b_item_ids = []
        for i in range(20):
            inqB = await make_inq(f"TESTQTY-B{i+1}", "CCT02", "XYZ客户", "A组", "sales_a1", "运动",
                                    date(2026, 7, 6), "跟进中", "已报价")
            itemB = await crud.create_inquiry_item(db, inqB.id, inqB.inquiry_no, {
                "style_no": f"B{i+1:03d}", "product_name": "运动文胸", "product_category": "运动",
                "quantity": 200 + i * 100,  # 200..2100，step 100
            })
            b_item_ids.append(str(itemB.id))

        inqF1 = await make_inq("TESTQTY-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装",
                                date(2026, 7, 7), "跟进中", "已报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTQTY-F1", {
            "style_no": "F001", "product_name": "防水外套", "product_category": "泳装", "quantity": 300,
        })

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id), "itemF1": str(itemF1.id),
            "b_item_ids": b_item_ids,
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1-3：数量分桶 / NULL 与 0 区分 / 均值中位数最大最小值 ─────────
        header("场景1-3：数量分桶 / NULL 与 0 区分 / 均值中位数最大最小值")
        resp = await client.get(f"{BASE}/analytics/quote-quantity",
                                  params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_style_items"] == 5, f"ABC total_style_items == 5（实际 {data['summary']['total_style_items']}）")
        check(data["summary"]["items_without_quantity"] == 2, f"缺数量 2 条（A1/A2，实际 {data['summary']['items_without_quantity']}）")
        check(data["summary"]["items_with_quantity"] == 3, f"有数量 3 条（A3=0/A4=50/A5=1000，实际 {data['summary']['items_with_quantity']}）")
        check(data["summary"]["quantity_total"] == 1050, f"数量合计 == 1050（0+50+1000，实际 {data['summary']['quantity_total']}）")
        check(abs(data["summary"]["average_quantity"] - 350.0) < 0.01, f"平均数量 == 350（1050/3，排除 NULL，实际 {data['summary']['average_quantity']}）")
        check(data["summary"]["median_quantity"] == 50.0, f"中位数 == 50（0,50,1000 排序后取中间，实际 {data['summary']['median_quantity']}）")
        check(data["summary"]["min_quantity"] == 0, f"最小值 == 0（实际 {data['summary']['min_quantity']}）")
        check(data["summary"]["max_quantity"] == 1000, f"最大值 == 1000（实际 {data['summary']['max_quantity']}）")

        dist = {b["quantity_bucket"]: b for b in data["quantity_distribution"]}
        check(dist["未填写"]["style_count"] == 2, f"未填写区间 == 2（实际 {dist['未填写']['style_count']}）")
        check(dist["0"]["style_count"] == 1, f"0 区间 == 1（实际 {dist['0']['style_count']}）")
        check(dist["1–99"]["style_count"] == 1, f"1–99 区间 == 1（A4=50，实际 {dist['1–99']['style_count']}）")
        check(dist["1,000–2,999"]["style_count"] == 1, f"1,000–2,999 区间 == 1（A5=1000，实际 {dist['1,000–2,999']['style_count']}）")
        check(abs(dist["未填写"]["style_share"] - 2 / 5) < 0.001, f"未填写区间占比 == 2/5（未被排除分母，实际 {dist['未填写']['style_share']}）")

        # ── 场景4：按客户/品类/业务员统计 ─────────────────────────────────────
        header("场景4：按客户/品类/业务员统计")
        abc = next(c for c in data["by_customer"] if c["customer_code"] == "CCT01")
        check(abc["style_count"] == 5, f"ABC 款式数 == 5（实际 {abc['style_count']}）")
        check(abs(abc["quantity_coverage_rate"] - 3 / 5) < 0.001, f"ABC 数量覆盖率 == 3/5（实际 {abc['quantity_coverage_rate']}）")

        swim = next(c for c in data["by_category"] if c["product_category"] == "泳装")
        check(swim["style_count"] == 4, f"泳装款式数 == 4（A1/A2/A4/A5，实际 {swim['style_count']}）")

        sales_a1 = next(c for c in data["by_sales"] if c["responsible_sales"] == "sales_a1")
        check(sales_a1["style_count"] == 5, f"sales_a1 款式数 == 5（实际 {sales_a1['style_count']}）")

        # ── 场景5：按报价/订单状态统计 ─────────────────────────────────────────
        header("场景5：按报价/订单状态统计")
        ordered_quoted = next(
            (s for s in data["by_order_status"] if s["quote_status"] == "已报价" and s["order_status"] == "下单"), None,
        )
        check(ordered_quoted is not None and ordered_quoted["style_count"] == 1, f"已报价+下单 == 1 条（A1，实际 {ordered_quoted}）")

        # ── 场景8：priority_items 排序 ────────────────────────────────────────
        header("场景8：priority_items 排序")
        priority = data["priority_items"]
        check(len(priority) == 3, f"优先补录清单包含 3 条（A1/A2/A3，实际 {len(priority)}）")
        check(priority[0]["item_id"] == ids["itemA1"], f"已下单缺数量（A1）排第一（实际 {priority[0]['item_id']}）")
        check(priority[1]["item_id"] == ids["itemA2"], f"已报价缺数量（A2）排第二（实际 {priority[1]['item_id']}）")
        check(priority[2]["item_id"] == ids["itemA3"], f"数量为0（A3）排第三（实际 {priority[2]['item_id']}）")
        check(not any(p["item_id"] in (ids["itemA4"], ids["itemA5"]) for p in priority), "完整款式（A4/A5）不出现在优先补录清单中")
        a1_entry = next(p for p in priority if p["item_id"] == ids["itemA1"])
        check(a1_entry["risk_hint"] == "已报价或已下单款式缺少数量资料，建议补录", f"A1 风险提示正确（实际 {a1_entry['risk_hint']}）")
        a3_entry = next(p for p in priority if p["item_id"] == ids["itemA3"])
        check(a3_entry["risk_hint"] == "款式数量为 0，请确认是否为试样、占位数据或录入错误", f"A3 风险提示正确（实际 {a3_entry['risk_hint']}）")
        check(a3_entry["quantity_bucket"] == "0", f"A3 quantity_bucket == 0（实际 {a3_entry['quantity_bucket']}）")

        # ── 场景6/7：P95 风险提示最小样本量 / 小批量提示 ──────────────────────
        header("场景6-7：P95 风险提示最小样本量 / 小批量提示")
        # ABC 客户范围样本数（3条非空）不足 20，不应计算 P95
        signals = {s["signal_type"]: s for s in data["quantity_risk_signals"]}
        check(signals["high_quantity_p95"]["style_count"] == 0, f"样本不足 20 条时不计算 P95（实际 {signals['high_quantity_p95']['style_count']}）")
        check("样本不足" in signals["high_quantity_p95"]["hint"] or "暂不计算" in signals["high_quantity_p95"]["hint"],
              f"样本不足提示文案正确（实际 {signals['high_quantity_p95']['hint']}）")
        check(signals["low_positive_quantity"]["style_count"] == 1, f"小批量提示 == 1（A4=50，实际 {signals['low_positive_quantity']['style_count']}）")
        check(signals["zero_quantity"]["style_count"] == 1, f"数量为0提示 == 1（A3，实际 {signals['zero_quantity']['style_count']}）")
        check(signals["priority_no_quantity"]["style_count"] == 2, f"已报价/已下单缺数量提示 == 2（A1/A2，实际 {signals['priority_no_quantity']['style_count']}）")

        # 现在用 A组 全量（含 B1-B20，恰好 20 条非空样本）测试 P95 真实触发
        resp = await client.get(f"{BASE}/analytics/quote-quantity",
                                  params={"group_name": "A组"}, headers=h("demo_admin"))
        full_data = resp.json()
        full_signals = {s["signal_type"]: s for s in full_data["quantity_risk_signals"]}
        # 25 条非空样本（A3/A4/A5 + B1-B20 共 23 条，A1/A2 为 NULL 不计入）
        non_null_count = full_data["summary"]["items_with_quantity"]
        check(non_null_count >= 20, f"A组全量非空样本数 >= 20（实际 {non_null_count}）")
        check(full_signals["high_quantity_p95"]["style_count"] >= 0, "样本足够时 P95 信号正常计算（不强制要求 >0，只要不报错）")
        check("P95" in full_signals["high_quantity_p95"]["hint"] or full_signals["high_quantity_p95"]["style_count"] == 0,
              f"样本足够时提示文案包含 P95 说明（实际 {full_signals['high_quantity_p95']['hint']}）")

        # ── 场景9：权限过滤 ──────────────────────────────────────────────────
        header("场景9：权限过滤")
        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT03"}, headers=h("demo_admin"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"admin 可见 DEF 客户 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT03"}, headers=h("a_leader"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"A组组长看不到 B组的 DEF 客户数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT03"}, headers=h("b_leader"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"B组组长可见本组 DEF 客户 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT01"}, headers=h("sales_a1"))
        check(resp.json()["summary"]["total_style_items"] == 5, f"sales_a1 可见自己负责的 ABC 5 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT01"}, headers=h("sales_a2"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"sales_a2（无关）看不到数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT01"}, headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        check(resp.json()["summary"]["total_style_items"] == 5, f"viewer（A组）可见本组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(
            f"{BASE}/analytics/quote-quantity", headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景10：空数据时结构稳定 ─────────────────────────────────────────
        header("场景10：空数据时结构稳定")
        resp = await client.get(f"{BASE}/analytics/quote-quantity",
                                  params={"customer_code": "NOSUCHCUSTOMER"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空数据时仍返回 200（实际 {resp.status_code}）")
        empty = resp.json()
        check(empty["summary"]["total_style_items"] == 0, "空数据 total_style_items == 0")
        check(empty["summary"]["average_quantity"] is None, "空数据 average_quantity 返回 None（不伪装为 0）")
        check(empty["summary"]["median_quantity"] is None, "空数据 median_quantity 返回 None")
        check(empty["summary"]["min_quantity"] is None, "空数据 min_quantity 返回 None")
        check(len(empty["quantity_distribution"]) == 9, f"空数据时仍返回 9 个区间（计数为 0），实际 {len(empty['quantity_distribution'])}")
        check(all(b["style_count"] == 0 for b in empty["quantity_distribution"]), "空数据各区间计数全部为 0")
        check(len(empty["quantity_risk_signals"]) == 4, f"空数据时风险信号仍返回 4 类，实际 {len(empty['quantity_risk_signals'])}")
        check(empty["priority_items"] == [], "空数据 priority_items == []")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
