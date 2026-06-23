"""
报价资料分析 Step 4 —— 数据完整度看板 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），
覆盖需求文档第十一节的场景 1-3（字段覆盖率 / 权限 / 优先补录排序）。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_quote_data_quality.py

会写入以 TESTDQ- 为前缀的测试询单，结束后自动清理。
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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTDQ-%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(text("delete from customers where customer_code = 'TDQ01'"))
    await db.commit()


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def seed() -> dict:
    """
    构造 5 条款式：
      1. 完整（complete）
      2. 缺款号（partial）
      3. 缺工艺（partial，原始说明和标签都没有）
      4. 缺尺码（partial，原始范围和标签都没有）
      5. 缺报价填报人（partial）
    全部挂在同一个询单 TESTDQ-001（A组，张三负责），用于场景 1。
    另外为场景 3（优先级排序）构造 2 条都"高缺失"且询单日期相同的款式，
    分别挂在新询单 TESTDQ-002（已下单）和 TESTDQ-003（未下单），用于单独
    验证"已下单/已报价优先"这一条规则（日期相同时才能看出这条规则的效果，
    因为需求文档里"最近询单优先"排在"已下单优先"前面，日期不同会掩盖这条规则）。
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        inq1 = await crud.create_inquiry(db, {
            "inquiry_no": "TESTDQ-001", "customer_code": "TDQ01", "customer_short_name": "数据完整度测试客户",
            "country": "美国", "group_name": "A组", "responsible_sales": "张三",
            "product_category": "泳装", "product_name": "男童泳裤", "series_name": "SS系列",
            "quantity": 100, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
        })

        item1 = await crud.create_inquiry_item(db, inq1.id, "TESTDQ-001", {
            "style_no": "D001", "product_name": "完整款式", "product_category": "泳装",
            "series_name": "SS系列", "quantity": 100, "quote_prepared_by": "李四",
            "process_description": "UV50+", "size_range": "S-XL",
        })
        from app.models.inquiry_item_process import InquiryItemProcess
        from app.models.inquiry_item_size import InquiryItemSize
        db.add(InquiryItemProcess(inquiry_item_id=item1.id, process_tag="UV50+", is_special=False))
        db.add(InquiryItemSize(inquiry_item_id=item1.id, size_code="M", is_special_size=False))
        await db.flush()

        item2 = await crud.create_inquiry_item(db, inq1.id, "TESTDQ-001", {
            "style_no": None, "product_name": "缺款号款式", "product_category": "泳装",
            "series_name": "SS系列", "quantity": 80, "quote_prepared_by": "李四",
            "process_description": "热压无缝", "size_range": "S-XL",
        })

        item3 = await crud.create_inquiry_item(db, inq1.id, "TESTDQ-001", {
            "style_no": "D003", "product_name": "缺工艺款式", "product_category": "泳装",
            "series_name": "SS系列", "quantity": 60, "quote_prepared_by": "李四",
            "process_description": "", "size_range": "S-XL",
        })

        item4 = await crud.create_inquiry_item(db, inq1.id, "TESTDQ-001", {
            "style_no": "D004", "product_name": "缺尺码款式", "product_category": "泳装",
            "series_name": "SS系列", "quantity": 60, "quote_prepared_by": "李四",
            "process_description": "热压无缝", "size_range": "   ",
        })

        item5 = await crud.create_inquiry_item(db, inq1.id, "TESTDQ-001", {
            "style_no": "D005", "product_name": "缺填报人款式", "product_category": "泳装",
            "series_name": "SS系列", "quantity": 60, "quote_prepared_by": "",
            "process_description": "热压无缝", "size_range": "S-XL",
        })

        # 场景3：高缺失 + 已下单 + 日期较早
        inq2 = await crud.create_inquiry(db, {
            "inquiry_no": "TESTDQ-002", "customer_code": "TDQ01", "customer_short_name": "数据完整度测试客户",
            "country": "美国", "group_name": "A组", "responsible_sales": "张三",
            "product_category": "泳装", "product_name": "已下单询单", "series_name": "SS系列",
            "quantity": 100, "inquiry_date": date(2026, 1, 20), "order_status": "下单",
        })
        item6 = await crud.create_inquiry_item(db, inq2.id, "TESTDQ-002", {
            "product_name": "高缺失已下单款式", "quantity": 50,
        })

        # 场景3：高缺失 + 未下单 + 日期较新（理论上比 item6 优先级低，因为 item6 已下单）
        inq3 = await crud.create_inquiry(db, {
            "inquiry_no": "TESTDQ-003", "customer_code": "TDQ01", "customer_short_name": "数据完整度测试客户",
            "country": "美国", "group_name": "A组", "responsible_sales": "张三",
            "product_category": "泳装", "product_name": "未下单询单", "series_name": "SS系列",
            "quantity": 100, "inquiry_date": date(2026, 1, 20), "order_status": "跟进中",
        })
        item7 = await crud.create_inquiry_item(db, inq3.id, "TESTDQ-003", {
            "product_name": "高缺失未下单款式", "quantity": 50,
        })

        await db.commit()
        return {
            "inq1": str(inq1.id), "inq2": str(inq2.id), "inq3": str(inq3.id),
            "item1": str(item1.id), "item2": str(item2.id), "item3": str(item3.id),
            "item4": str(item4.id), "item5": str(item5.id),
            "item6": str(item6.id), "item7": str(item7.id),
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1：字段覆盖率 ────────────────────────────────────────────────
        header("场景1：字段覆盖率")
        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"responsible_sales": "张三"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_inquiry_items"] == 7, f"total_inquiry_items == 7（实际 {data['summary']['total_inquiry_items']}）")

        cov = {f["field_key"]: f for f in data["field_coverage"]}
        check(cov["style_no"]["missing_count"] == 3, f"款号缺失 3 条（item2/6/7，实际 {cov['style_no']['missing_count']}）")
        check(cov["process_description"]["missing_count"] == 3, f"原始工艺说明缺失 3 条（item3/6/7，实际 {cov['process_description']['missing_count']}）")
        check(cov["size_range"]["missing_count"] == 3, f"原始尺码范围缺失 3 条（item4/6/7，实际 {cov['size_range']['missing_count']}）")
        check(cov["quote_prepared_by"]["missing_count"] == 3, f"报价单填报人缺失 3 条（item5/6/7，实际 {cov['quote_prepared_by']['missing_count']}）")
        check(
            abs(cov["style_no"]["coverage_rate"] - (4 / 7)) < 0.001,
            f"coverage_rate 计算正确（实际 {cov['style_no']['coverage_rate']}）",
        )

        # item1 完整；item2-5 部分完整（各缺一项关键资料）；item6/7 高缺失
        check(data["summary"]["complete_items"] == 1, f"完整款式数 == 1（实际 {data['summary']['complete_items']}）")
        check(data["summary"]["partially_complete_items"] == 4, f"部分完整款式数 == 4（实际 {data['summary']['partially_complete_items']}）")
        check(data["summary"]["high_missing_items"] == 2, f"高缺失款式数 == 2（实际 {data['summary']['high_missing_items']}）")

        check(len(data["by_customer"]) >= 1, "按客户分组有数据")
        check(len(data["by_sales"]) >= 1, "按业务员分组有数据")
        check(len(data["by_category"]) >= 1, "按品类分组有数据")

        # ── 场景2：权限 ──────────────────────────────────────────────────────
        header("场景2：权限")

        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("demo_admin"))
        admin_total = resp.json()["summary"]["total_inquiry_items"]
        check(admin_total == 7, f"admin 可见全部 7 条（实际 {admin_total}）")

        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("a_leader"))
        check(resp.status_code == 200, "A组组长可访问接口")
        a_leader_total = resp.json()["summary"]["total_inquiry_items"]
        check(a_leader_total == 7, f"A组组长可见本组全部 7 条（实际 {a_leader_total}）")

        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("b_leader"))
        b_leader_total = resp.json()["summary"]["total_inquiry_items"]
        check(b_leader_total == 0, f"B组组长看不到 A组数据（实际 {b_leader_total}）")

        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("sales_a1"))
        sales_total = resp.json()["summary"]["total_inquiry_items"]
        check(sales_total == 0, f"sales（张伟，与这些询单无关）看不到数据（实际 {sales_total}）")

        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读，无编辑接口）")
        viewer_total = resp.json()["summary"]["total_inquiry_items"]
        check(viewer_total == 7, f"viewer（A组）可见本组数据（实际 {viewer_total}）")

        resp = await client.get(
            f"{BASE}/analytics/quote-data-quality",
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景3：优先补录排序 ──────────────────────────────────────────────
        header("场景3：优先补录排序")
        resp = await client.get(f"{BASE}/analytics/quote-data-quality",
                                  params={"customer_code": "TDQ01"}, headers=h("demo_admin"))
        priority = resp.json()["priority_items"]
        check(len(priority) == 6, f"优先补录清单包含 6 条（item1 完整不在内，实际 {len(priority)}）")

        top2_ids = {priority[0]["item_id"], priority[1]["item_id"]}
        check(top2_ids == {ids["item6"], ids["item7"]}, "高缺失款式排在最前")

        item6_idx = next(i for i, p in enumerate(priority) if p["item_id"] == ids["item6"])
        item7_idx = next(i for i, p in enumerate(priority) if p["item_id"] == ids["item7"])
        check(
            item6_idx < item7_idx,
            "询单日期相同时，已下单的高缺失款式（item6）排在未下单的（item7）之前",
        )

        partial_entries = [p for p in priority if p["completeness_level"] == "partial"]
        check(len(partial_entries) == 4, f"部分完整的 4 条都在清单中（实际 {len(partial_entries)}）")
        check(
            all(len(p["missing_fields"]) == p["missing_field_count"] for p in priority),
            "missing_fields 列表长度与 missing_field_count 一致",
        )
        item2_entry = next(p for p in priority if p["item_id"] == ids["item2"])
        check("款号" in item2_entry["missing_fields"], f"缺失字段中文名正确（实际 {item2_entry['missing_fields']}）")

        # 一致性回归测试：item1 是"完整"款式（process_description/size_range 都填了，
        # 只是没有标准化标签），不应该出现在优先补录清单里——否则就是"完整度=完整，
        # 但仍列出缺失字段"的自相矛盾展示（浏览器验收时发现并修复的真实问题）。
        check(
            not any(p["item_id"] == ids["item1"] for p in priority),
            "完整款式（item1）不会出现在优先补录清单中",
        )

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
