"""
报价资料分析 Step 6 —— 产品工艺分析 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第十二节列出的场景：工艺应用次数 / 特殊工艺统计 / 原始说明与标签缺失
三态区分 / 按品类统计 / 按客户统计 / 关联平均值的 null 处理 / 风险提示 /
priority_items 排序 / 权限过滤 / 空数据稳定性。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_process_analysis.py

会写入以 TESTPA- 为前缀的测试询单，结束后自动清理。
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from datetime import date, timedelta
from sqlalchemy import delete, select, text

from app.database import AsyncSessionLocal
from app import crud
from app.models import Inquiry, OperationLog, InquiryWarning
from app.models.inquiry_item import InquiryItem
from app.models.inquiry_item_process import InquiryItemProcess
from app.models.sample_record import SampleRecord
from app.models.production_record import ProductionRecord

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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTPA-%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(SampleRecord).where(SampleRecord.inquiry_id.in_(inq_ids)))
        await db.execute(delete(ProductionRecord).where(ProductionRecord.inquiry_id.in_(inq_ids)))
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
      itemA1 ABC/泳装 UV50+(特殊)+环保面料(常规)，有原始说明，已报价
      itemA2 ABC/泳装 UV50+(特殊)，有原始说明，已报价，工厂价缺失（测 null 处理）
      itemA3 ABC/内衣 热压(常规)，无原始说明，已下单            → 优先补录 tier3
      itemA4 ABC/泳装 无标签，有原始说明                        → 优先补录 tier0
      itemA5 ABC/泳装 镭射雕花(特殊)，无原始说明，未下单未报价   → 优先补录 tier1
      itemB1 XYZ/运动 弹力贴合(常规)，有原始说明、有标签（完整，不入选优先补录）

      inqA5 关联一条逾期打样记录；inqA2 关联一条生产延期记录。

    B组（sales_b1，权限隔离用）：
      itemF1 DEF/泳装 防水涂层(特殊)，有原始说明、有标签（完整）
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        async def make_inq(no, cust_code, cust_name, group, sales, cat, qty, d, order_status, quote_status,
                            final_quote=None, factory_price=None, gp=None):
            return await crud.create_inquiry(db, {
                "inquiry_no": no, "customer_code": cust_code, "customer_short_name": cust_name,
                "group_name": group, "responsible_sales": sales,
                "product_category": cat, "product_name": f"{no}询单", "quantity": qty,
                "inquiry_date": d, "order_status": order_status, "quote_status": quote_status,
                "final_quote": final_quote, "factory_price": factory_price, "gross_profit_rate": gp,
            })

        inqA1 = await make_inq("TESTPA-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 100,
                                date(2026, 4, 1), "跟进中", "已报价", 12.5, 8.0, 0.30)
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTPA-A1", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 100,
            "process_description": "UV50+面料",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA1.id, process_tag="UV50+", is_special=True))
        db.add(InquiryItemProcess(inquiry_item_id=itemA1.id, process_tag="环保面料", is_special=False))

        inqA2 = await make_inq("TESTPA-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 80,
                                date(2026, 4, 5), "跟进中", "已报价", 13.0, None, 0.28)
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTPA-A2", {
            "style_no": "A002", "product_name": "连体泳衣", "product_category": "泳装", "quantity": 80,
            "process_description": "UV50+",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA2.id, process_tag="UV50+", is_special=True))

        inqA3 = await make_inq("TESTPA-A3", "CCT01", "ABC客户", "A组", "sales_a1", "内衣", 50,
                                date(2026, 4, 2), "下单", "跟进中")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTPA-A3", {
            "style_no": "A003", "product_name": "运动内衣", "product_category": "内衣", "quantity": 50,
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA3.id, process_tag="热压", is_special=False))

        inqA4 = await make_inq("TESTPA-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 30,
                                date(2026, 4, 3), "跟进中", "未报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTPA-A4", {
            "style_no": "A004", "product_name": "泳裤", "product_category": "泳装", "quantity": 30,
            "process_description": "特殊定制工艺",
        })

        inqA5 = await make_inq("TESTPA-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 20,
                                date(2026, 4, 10), "跟进中", "未报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTPA-A5", {
            "style_no": "A005", "product_name": "防晒衣", "product_category": "泳装", "quantity": 20,
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA5.id, process_tag="镭射雕花", is_special=True))

        inqB1 = await make_inq("TESTPA-B1", "CCT02", "XYZ客户", "A组", "sales_a1", "运动", 40,
                                date(2026, 4, 4), "跟进中", "已报价", 9.0, 6.0, 0.25)
        itemB1 = await crud.create_inquiry_item(db, inqB1.id, "TESTPA-B1", {
            "style_no": "B001", "product_name": "运动文胸", "product_category": "运动", "quantity": 40,
            "process_description": "弹力面料",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemB1.id, process_tag="弹力贴合", is_special=False))

        inqF1 = await make_inq("TESTPA-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装", 15,
                                date(2026, 4, 6), "跟进中", "已报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTPA-F1", {
            "style_no": "F001", "product_name": "防水外套", "product_category": "泳装", "quantity": 15,
            "process_description": "防水涂层工艺",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemF1.id, process_tag="防水涂层", is_special=True))

        await db.flush()

        # inqA5：逾期打样（factory_due_date 已过期，状态未到终态）
        db.add(SampleRecord(
            sample_no="TESTPA-SMP-001", inquiry_id=inqA5.id, inquiry_no=inqA5.inquiry_no,
            sample_status="making", factory_due_date=date.today() - timedelta(days=10),
        ))
        # inqA2：生产延期（显式 production_status='delayed'）
        db.add(ProductionRecord(
            production_no="TESTPA-PROD-001", inquiry_id=inqA2.id, inquiry_no=inqA2.inquiry_no,
            production_status="delayed",
        ))

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id), "itemB1": str(itemB1.id),
            "itemF1": str(itemF1.id),
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1-3：工艺应用次数 / 特殊工艺统计 / 缺失三态区分 ──────────────
        header("场景1-3：工艺应用次数 / 特殊工艺统计 / 缺失三态区分")
        resp = await client.get(f"{BASE}/analytics/processes", params={"group_name": "A组"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_style_items"] == 6, f"A组 total_style_items == 6（实际 {data['summary']['total_style_items']}）")
        check(data["summary"]["items_without_process_description"] == 2, f"缺原始说明 2 条（A3/A5，实际 {data['summary']['items_without_process_description']}）")
        check(data["summary"]["items_without_process_tags"] == 1, f"缺标准化标签 1 条（A4，实际 {data['summary']['items_without_process_tags']}）")
        check(data["summary"]["total_process_applications"] == 6, f"工艺应用总次数 == 6（实际 {data['summary']['total_process_applications']}）")
        check(data["summary"]["unique_process_tags"] == 5, f"工艺标签种类数 == 5（实际 {data['summary']['unique_process_tags']}）")
        check(data["summary"]["special_process_applications"] == 3, f"特殊工艺应用次数 == 3（UV50+×2 + 镭射雕花×1，实际 {data['summary']['special_process_applications']}）")
        check(abs(data["summary"]["special_process_share"] - 0.5) < 0.001, f"特殊工艺占比 == 0.5（实际 {data['summary']['special_process_share']}）")

        uv = next(r for r in data["process_rankings"] if r["process_tag"] == "UV50+")
        check(uv["application_count"] == 2, f"UV50+ 应用次数 == 2（实际 {uv['application_count']}）")
        check(uv["is_special"] is True, "UV50+ 标记为特殊工艺")
        check(uv["customer_count"] == 1, f"UV50+ 涉及客户数 == 1（实际 {uv['customer_count']}）")
        check(uv["quantity_total"] == 180, f"UV50+ 数量合计 == 180（实际 {uv['quantity_total']}）")

        # ── 场景6：关联平均值 null 处理 ──────────────────────────────────────
        header("场景6：关联平均值 null 处理")
        check(abs(uv["average_final_quote"] - 12.75) < 0.001, f"UV50+ 关联平均报价 == 12.75（实际 {uv['average_final_quote']}）")
        check(abs(uv["average_factory_price"] - 8.0) < 0.001, f"UV50+ 关联平均工厂价忽略缺失值后 == 8.0（实际 {uv['average_factory_price']}）")
        lasered = next(r for r in data["process_rankings"] if r["process_tag"] == "镭射雕花")
        check(lasered["average_final_quote"] is None, f"镭射雕花关联报价全部缺失时返回 null（实际 {lasered['average_final_quote']}）")

        # ── 场景4：按品类 ────────────────────────────────────────────────────
        header("场景4：按品类统计")
        swim = next(c for c in data["by_category"] if c["product_category"] == "泳装")
        check(swim["style_count"] == 4, f"泳装款式数 == 4（A1/A2/A4/A5，实际 {swim['style_count']}）")
        check(swim["items_with_process_tags"] == 3, f"泳装有标签款式数 == 3（A1/A2/A5，实际 {swim['items_with_process_tags']}）")
        check(abs(swim["process_coverage_rate"] - 0.75) < 0.001, f"泳装工艺覆盖率 == 0.75（实际 {swim['process_coverage_rate']}）")
        check(swim["special_process_style_count"] == 3, f"泳装特殊工艺款式数 == 3（A1/A2/A5，实际 {swim['special_process_style_count']}）")

        # ── 场景5：按客户 ────────────────────────────────────────────────────
        header("场景5：按客户统计")
        abc = next(c for c in data["by_customer"] if c["customer_code"] == "CCT01")
        check(abc["style_count"] == 5, f"ABC 款式数 == 5（实际 {abc['style_count']}）")
        check(abs(abc["process_coverage_rate"] - 0.8) < 0.001, f"ABC 工艺覆盖率 == 0.8（A4 缺标签，实际 {abc['process_coverage_rate']}）")
        check(abc["special_process_style_count"] == 3, f"ABC 特殊工艺款式数 == 3（实际 {abc['special_process_style_count']}）")

        # ── 场景7：工艺风险信号 ──────────────────────────────────────────────
        header("场景7：工艺风险信号")
        signals = {s["signal_type"]: s for s in data["process_risk_signals"]}
        check(signals["special_no_description"]["style_count"] == 1, f"特殊工艺缺说明 == 1（A5，实际 {signals['special_no_description']['style_count']}）")
        check(signals["description_no_tags"]["style_count"] == 1, f"有说明缺标签 == 1（A4，实际 {signals['description_no_tags']['style_count']}）")
        check(signals["special_sample_delay"]["style_count"] == 1, f"特殊工艺+打样逾期 == 1（A5，实际 {signals['special_sample_delay']['style_count']}）")
        check(signals["special_production_delay"]["style_count"] == 1, f"特殊工艺+生产延期 == 1（A2，实际 {signals['special_production_delay']['style_count']}）")

        # ── 场景8：priority_items 排序 ───────────────────────────────────────
        header("场景8：priority_items 排序")
        priority = data["priority_items"]
        check(len(priority) == 3, f"优先补录清单包含 3 条（A3/A4/A5，实际 {len(priority)}）")
        check(priority[0]["item_id"] == ids["itemA3"], f"已下单+缺说明（A3）排第一（实际第一条 item_id={priority[0]['item_id']}）")
        check(priority[1]["item_id"] == ids["itemA5"], f"特殊工艺+缺说明（A5）排第二（实际 {priority[1]['item_id']}）")
        check(priority[2]["item_id"] == ids["itemA4"], f"有说明缺标签（A4）排第三（实际 {priority[2]['item_id']}）")
        check(not any(p["item_id"] == ids["itemB1"] for p in priority), "完整款式（B1）不出现在优先补录清单中")
        a3_entry = next(p for p in priority if p["item_id"] == ids["itemA3"])
        check("原始工艺说明" in a3_entry["missing_fields"], f"A3 缺失字段正确（实际 {a3_entry['missing_fields']}）")
        check(a3_entry["risk_hint"] == "缺少原始工艺说明", f"A3 风险提示正确（实际 {a3_entry['risk_hint']}）")
        a5_entry = next(p for p in priority if p["item_id"] == ids["itemA5"])
        check(a5_entry["risk_hint"] == "特殊工艺缺少原始说明，建议补充具体工艺要求", f"A5 风险提示正确（实际 {a5_entry['risk_hint']}）")

        # ── min_usage_count 过滤 ─────────────────────────────────────────────
        header("场景：min_usage_count 过滤")
        resp = await client.get(f"{BASE}/analytics/processes",
                                  params={"group_name": "A组", "min_usage_count": 2}, headers=h("demo_admin"))
        filtered = resp.json()
        check(len(filtered["process_rankings"]) == 1, f"min_usage_count=2 时只剩 UV50+ 1 条（实际 {len(filtered['process_rankings'])}）")
        check(filtered["summary"]["total_style_items"] == 6, "min_usage_count 不影响总览口径")

        # ── process_tag / is_special 筛选 ────────────────────────────────────
        header("场景：process_tag / is_special 筛选")
        resp = await client.get(f"{BASE}/analytics/processes",
                                  params={"group_name": "A组", "process_tag": "uv50+"}, headers=h("demo_admin"))
        tag_filtered = resp.json()
        check(tag_filtered["summary"]["total_style_items"] == 2, f"process_tag=uv50+（大小写不敏感）命中 2 条（实际 {tag_filtered['summary']['total_style_items']}）")
        check(tag_filtered["summary"]["unique_process_tags"] == 2, f"命中款式的全部标签都保留统计，应有 2 种标签（UV50+/环保面料，实际 {tag_filtered['summary']['unique_process_tags']}）")

        resp = await client.get(f"{BASE}/analytics/processes",
                                  params={"group_name": "A组", "is_special": True}, headers=h("demo_admin"))
        special_filtered = resp.json()
        check(special_filtered["summary"]["total_style_items"] == 3, f"is_special=true 命中 3 条（A1/A2/A5，实际 {special_filtered['summary']['total_style_items']}）")

        # ── 场景9：权限过滤 ──────────────────────────────────────────────────
        header("场景9：权限过滤")
        resp = await client.get(f"{BASE}/analytics/processes", headers=h("demo_admin"))
        check(resp.json()["summary"]["total_style_items"] == 7, f"admin 可见全部 7 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/processes", headers=h("a_leader"))
        check(resp.json()["summary"]["total_style_items"] == 6, f"A组组长只看到本组 6 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/processes", headers=h("b_leader"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"B组组长只看到本组 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/processes", headers=h("sales_a1"))
        check(resp.json()["summary"]["total_style_items"] == 6, f"sales_a1 可见自己负责的 6 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/processes", headers=h("sales_a2"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"sales_a2（无关）看不到数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/processes", headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        check(resp.json()["summary"]["total_style_items"] == 6, f"viewer（A组）可见本组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(
            f"{BASE}/analytics/processes", headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景10：空数据时结构稳定 ─────────────────────────────────────────
        header("场景10：空数据时结构稳定")
        resp = await client.get(f"{BASE}/analytics/processes",
                                  params={"customer_code": "NOSUCHCUSTOMER"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空数据时仍返回 200（实际 {resp.status_code}）")
        empty = resp.json()
        check(empty["summary"]["total_style_items"] == 0, "空数据 total_style_items == 0")
        check(empty["process_rankings"] == [], "空数据 process_rankings == []")
        check(len(empty["process_risk_signals"]) == 4, f"空数据时风险信号仍返回 4 类（计数为 0），实际 {len(empty['process_risk_signals'])}")
        check(all(s["style_count"] == 0 for s in empty["process_risk_signals"]), "空数据风险信号计数全部为 0")
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
