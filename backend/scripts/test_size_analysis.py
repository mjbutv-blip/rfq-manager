"""
报价资料分析 Step 7 —— 尺码范围与尺码偏好分析 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第十三节列出的场景：标准化尺码应用次数 / 特殊尺码统计 / 原始范围与
标准化三态区分 / 按品类统计 / 按客户统计 / 尺码跨度分组 / 风险提示 /
priority_items 排序 / 权限过滤 / 空数据稳定性。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_size_analysis.py

会写入以 TESTSZ- 为前缀的测试询单，结束后自动清理。
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
from app.models.inquiry_item_size import InquiryItemSize
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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTSZ-%"))
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
      itemA1 ABC/泳装 尺码 S/M/L/XL（4个，中跨度），有原始范围，已报价
      itemA2 ABC/泳装 尺码 3XL(特殊)，有原始范围，已报价                → 特殊尺码
      itemA3 ABC/内衣 无任何尺码资料，已下单                            → 优先补录 tier3
      itemA4 ABC/泳装 有原始范围，无标准化尺码                          → 优先补录 tier2（已下单/已报价之外另测 tier 时用，这里设为未下单未报价 → tier0）
      itemA5 ABC/泳装 尺码 杯型特殊(特殊)，无原始范围，未下单未报价      → 优先补录 tier1
      itemB1 XYZ/运动 尺码 S/M（2个，窄跨度），有原始范围、有标准化（完整）

      inqA5 关联一条逾期打样记录；inqA2 关联一条生产延期记录。

    B组（sales_b1，权限隔离用）：
      itemF1 DEF/泳装 尺码 M（完整）
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        async def make_inq(no, cust_code, cust_name, group, sales, cat, qty, d, order_status, quote_status):
            return await crud.create_inquiry(db, {
                "inquiry_no": no, "customer_code": cust_code, "customer_short_name": cust_name,
                "group_name": group, "responsible_sales": sales,
                "product_category": cat, "product_name": f"{no}询单", "quantity": qty,
                "inquiry_date": d, "order_status": order_status, "quote_status": quote_status,
            })

        inqA1 = await make_inq("TESTSZ-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 100,
                                date(2026, 5, 1), "跟进中", "已报价")
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTSZ-A1", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 100,
            "size_range": "S-XL",
        })
        for code in ["S", "M", "L", "XL"]:
            db.add(InquiryItemSize(inquiry_item_id=itemA1.id, size_code=code, is_special_size=False))

        inqA2 = await make_inq("TESTSZ-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 80,
                                date(2026, 5, 5), "跟进中", "已报价")
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTSZ-A2", {
            "style_no": "A002", "product_name": "加大码泳衣", "product_category": "泳装", "quantity": 80,
            "size_range": "3XL专属",
        })
        db.add(InquiryItemSize(inquiry_item_id=itemA2.id, size_code="3XL", is_special_size=True))

        inqA3 = await make_inq("TESTSZ-A3", "CCT01", "ABC客户", "A组", "sales_a1", "内衣", 50,
                                date(2026, 5, 2), "下单", "跟进中")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTSZ-A3", {
            "style_no": "A003", "product_name": "运动内衣", "product_category": "内衣", "quantity": 50,
        })

        inqA4 = await make_inq("TESTSZ-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 30,
                                date(2026, 5, 3), "跟进中", "未报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTSZ-A4", {
            "style_no": "A004", "product_name": "泳裤", "product_category": "泳装", "quantity": 30,
            "size_range": "均码",
        })

        inqA5 = await make_inq("TESTSZ-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", 20,
                                date(2026, 5, 10), "跟进中", "未报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTSZ-A5", {
            "style_no": "A005", "product_name": "定制杯型泳衣", "product_category": "泳装", "quantity": 20,
        })
        db.add(InquiryItemSize(inquiry_item_id=itemA5.id, size_code="80D", is_special_size=True))

        inqB1 = await make_inq("TESTSZ-B1", "CCT02", "XYZ客户", "A组", "sales_a1", "运动", 40,
                                date(2026, 5, 4), "跟进中", "已报价")
        itemB1 = await crud.create_inquiry_item(db, inqB1.id, "TESTSZ-B1", {
            "style_no": "B001", "product_name": "运动文胸", "product_category": "运动", "quantity": 40,
            "size_range": "S-M",
        })
        db.add(InquiryItemSize(inquiry_item_id=itemB1.id, size_code="S", is_special_size=False))
        db.add(InquiryItemSize(inquiry_item_id=itemB1.id, size_code="M", is_special_size=False))

        inqF1 = await make_inq("TESTSZ-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装", 15,
                                date(2026, 5, 6), "跟进中", "已报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTSZ-F1", {
            "style_no": "F001", "product_name": "防水外套", "product_category": "泳装", "quantity": 15,
            "size_range": "M",
        })
        db.add(InquiryItemSize(inquiry_item_id=itemF1.id, size_code="M", is_special_size=False))

        await db.flush()

        db.add(SampleRecord(
            sample_no="TESTSZ-SMP-001", inquiry_id=inqA5.id, inquiry_no=inqA5.inquiry_no,
            sample_status="making", factory_due_date=date.today() - timedelta(days=10),
        ))
        db.add(ProductionRecord(
            production_no="TESTSZ-PROD-001", inquiry_id=inqA2.id, inquiry_no=inqA2.inquiry_no,
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
        # ── 场景1-3：应用次数 / 特殊尺码统计 / 缺失三态区分 ───────────────────
        header("场景1-3：标准化尺码应用次数 / 特殊尺码统计 / 缺失三态区分")
        resp = await client.get(f"{BASE}/analytics/sizes", params={"group_name": "A组"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_style_items"] == 6, f"A组 total_style_items == 6（实际 {data['summary']['total_style_items']}）")
        check(data["summary"]["items_without_size_data"] == 1, f"完全缺尺码资料 1 条（A3，实际 {data['summary']['items_without_size_data']}）")
        check(data["summary"]["items_with_size_range_but_no_standard_sizes"] == 1, f"有范围缺标准化 1 条（A4，实际 {data['summary']['items_with_size_range_but_no_standard_sizes']}）")
        check(data["summary"]["total_size_applications"] == 8, f"尺码应用总次数 == 8（A1:4 + A2:1 + A5:1 + B1:2，实际 {data['summary']['total_size_applications']}）")
        check(data["summary"]["unique_size_codes"] == 6, f"尺码种类数 == 6（实际 {data['summary']['unique_size_codes']}）")
        check(data["summary"]["special_size_applications"] == 2, f"特殊尺码应用次数 == 2（3XL+80D，实际 {data['summary']['special_size_applications']}）")
        check(abs(data["summary"]["special_size_share"] - 2 / 8) < 0.001, f"特殊尺码占比 == 2/8（实际 {data['summary']['special_size_share']}）")

        m_rank = next(r for r in data["size_rankings"] if r["size_code"] == "M")
        check(m_rank["application_count"] == 2, f"M 应用次数 == 2（A1 + B1，实际 {m_rank['application_count']}）")
        threexl = next(r for r in data["size_rankings"] if r["size_code"] == "3XL")
        check(threexl["is_special_size"] is True, "3XL 标记为特殊尺码")

        # ── 场景6：尺码跨度分组 ──────────────────────────────────────────────
        header("场景6：尺码跨度分组")
        buckets = {b["span_bucket"]: b for b in data["size_span_distribution"]}
        check(buckets["未标准化"]["style_count"] == 2, f"未标准化 == 2（A3 无任何尺码资料 + A4 有原始范围但 0 个标准化尺码，实际 {buckets['未标准化']['style_count']}）")
        check(buckets["单尺码"]["style_count"] == 2, f"单尺码 == 2（A2/A5，实际 {buckets['单尺码']['style_count']}）")
        check(buckets["中跨度（4-5）"]["style_count"] == 1, f"中跨度 == 1（A1，4个尺码，实际 {buckets['中跨度（4-5）']['style_count']}）")
        check(buckets["窄跨度（2-3）"]["style_count"] == 1, f"窄跨度 == 1（B1，S/M 2个尺码，实际 {buckets['窄跨度（2-3）']['style_count']}）")

        # ── 场景4：按品类 ────────────────────────────────────────────────────
        header("场景4：按品类统计")
        swim = next(c for c in data["by_category"] if c["product_category"] == "泳装")
        check(swim["style_count"] == 4, f"泳装款式数 == 4（A1/A2/A4/A5，实际 {swim['style_count']}）")
        check(swim["special_size_style_count"] == 2, f"泳装特殊尺码款式数 == 2（A2/A5，实际 {swim['special_size_style_count']}）")

        # ── 场景5：按客户 ────────────────────────────────────────────────────
        header("场景5：按客户统计")
        abc = next(c for c in data["by_customer"] if c["customer_code"] == "CCT01")
        check(abc["style_count"] == 5, f"ABC 款式数 == 5（实际 {abc['style_count']}）")
        check(abc["special_size_style_count"] == 2, f"ABC 特殊尺码款式数 == 2（实际 {abc['special_size_style_count']}）")

        # ── 场景7：尺码风险信号 ──────────────────────────────────────────────
        header("场景7：尺码风险信号")
        signals = {s["signal_type"]: s for s in data["size_risk_signals"]}
        check(signals["special_no_range"]["style_count"] == 1, f"特殊尺码缺原始范围 == 1（A5，实际 {signals['special_no_range']['style_count']}）")
        check(signals["range_no_standard"]["style_count"] == 1, f"有范围缺标准化 == 1（A4，实际 {signals['range_no_standard']['style_count']}）")
        check(signals["special_sample_delay"]["style_count"] == 1, f"特殊尺码+打样延期 == 1（A5，实际 {signals['special_sample_delay']['style_count']}）")
        check(signals["special_production_delay"]["style_count"] == 1, f"特殊尺码+生产延期 == 1（A2，实际 {signals['special_production_delay']['style_count']}）")

        # ── 场景8：priority_items 排序 ───────────────────────────────────────
        header("场景8：priority_items 排序")
        priority = data["priority_items"]
        check(len(priority) == 3, f"优先补录清单包含 3 条（A3/A4/A5，实际 {len(priority)}）")
        check(priority[0]["item_id"] == ids["itemA3"], f"已下单+无尺码资料（A3）排第一（实际 {priority[0]['item_id']}）")
        check(priority[1]["item_id"] == ids["itemA5"], f"特殊尺码+缺范围（A5）排第二（实际 {priority[1]['item_id']}）")
        check(priority[2]["item_id"] == ids["itemA4"], f"有范围缺标准化（A4）排第三（实际 {priority[2]['item_id']}）")
        check(not any(p["item_id"] == ids["itemB1"] for p in priority), "完整款式（B1）不出现在优先补录清单中")
        a3_entry = next(p for p in priority if p["item_id"] == ids["itemA3"])
        check(set(a3_entry["missing_fields"]) == {"原始尺码范围", "标准化尺码"}, f"A3 缺失字段正确（实际 {a3_entry['missing_fields']}）")
        a5_entry = next(p for p in priority if p["item_id"] == ids["itemA5"])
        check(a5_entry["risk_hint"] == "包含特殊尺码，但缺少原始尺码范围说明", f"A5 风险提示正确（实际 {a5_entry['risk_hint']}）")

        # ── min_usage_count 过滤 ─────────────────────────────────────────────
        header("场景：min_usage_count 过滤")
        resp = await client.get(f"{BASE}/analytics/sizes",
                                  params={"group_name": "A组", "min_usage_count": 2}, headers=h("demo_admin"))
        filtered = resp.json()
        check(len(filtered["size_rankings"]) == 2, f"min_usage_count=2 时只剩 S/M 2 条（A1+B1 都用了 S 和 M，实际 {len(filtered['size_rankings'])}）")
        check({r["size_code"] for r in filtered["size_rankings"]} == {"S", "M"}, f"min_usage_count=2 时剩下的是 S/M（实际 {[r['size_code'] for r in filtered['size_rankings']]}）")
        check(filtered["summary"]["total_style_items"] == 6, "min_usage_count 不影响总览口径")

        # ── size_code / is_special_size 筛选 ─────────────────────────────────
        header("场景：size_code / is_special_size 筛选")
        resp = await client.get(f"{BASE}/analytics/sizes",
                                  params={"group_name": "A组", "size_code": "3xl"}, headers=h("demo_admin"))
        tag_filtered = resp.json()
        check(tag_filtered["summary"]["total_style_items"] == 1, f"size_code=3xl（大小写不敏感）命中 1 条（实际 {tag_filtered['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes",
                                  params={"group_name": "A组", "is_special_size": True}, headers=h("demo_admin"))
        special_filtered = resp.json()
        check(special_filtered["summary"]["total_style_items"] == 2, f"is_special_size=true 命中 2 条（A2/A5，实际 {special_filtered['summary']['total_style_items']}）")

        # ── 场景9：权限过滤 ──────────────────────────────────────────────────
        header("场景9：权限过滤")
        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("demo_admin"))
        check(resp.json()["summary"]["total_style_items"] == 7, f"admin 可见全部 7 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("a_leader"))
        check(resp.json()["summary"]["total_style_items"] == 6, f"A组组长只看到本组 6 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("b_leader"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"B组组长只看到本组 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("sales_a1"))
        check(resp.json()["summary"]["total_style_items"] == 6, f"sales_a1 可见自己负责的 6 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("sales_a2"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"sales_a2（无关）看不到数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/sizes", headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        check(resp.json()["summary"]["total_style_items"] == 6, f"viewer（A组）可见本组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(
            f"{BASE}/analytics/sizes", headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景10：空数据时结构稳定 ─────────────────────────────────────────
        header("场景10：空数据时结构稳定")
        resp = await client.get(f"{BASE}/analytics/sizes",
                                  params={"customer_code": "NOSUCHCUSTOMER"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空数据时仍返回 200（实际 {resp.status_code}）")
        empty = resp.json()
        check(empty["summary"]["total_style_items"] == 0, "空数据 total_style_items == 0")
        check(empty["size_rankings"] == [], "空数据 size_rankings == []")
        check(len(empty["size_span_distribution"]) == 5, f"空数据时跨度分布仍返回 5 档（计数为 0），实际 {len(empty['size_span_distribution'])}")
        check(all(b["style_count"] == 0 for b in empty["size_span_distribution"]), "空数据跨度分布计数全部为 0")
        check(len(empty["size_risk_signals"]) == 4, f"空数据时风险信号仍返回 4 类，实际 {len(empty['size_risk_signals'])}")
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
