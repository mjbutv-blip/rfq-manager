"""
报价资料分析总览 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第九节列出的场景：权限过滤 / 总览卡片与子分析页面口径一致 / key_gaps
覆盖率与优先级 / priority_items 去重排序 / 空数据结构稳定 / 筛选条件同时
作用于所有汇总区块。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_quote_analysis_overview.py

会写入以 TESTOV- 为前缀的测试询单，结束后自动清理。
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
from app.models.inquiry_item_process import InquiryItemProcess
from app.models.inquiry_item_size import InquiryItemSize

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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTOV-%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(text("delete from customers where customer_code in ('CCT01', 'CCT03')"))
    await db.commit()


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def seed() -> dict:
    """
    A组（sales_a1）：
      itemA1 完整款式（已下单），不应出现在 priority_items 中；
      itemA2 同时缺款号/工艺/尺码/填报人/数量，但不是已下单/已报价 → tier(0,0,1,1)；
      itemA3 同时缺四项 + 已下单 → tier(1,0,1,1)，预期排第一；
      itemA4 特殊工艺缺原始说明，其余资料齐全（只触发风险信号）→ tier(0,0,0,1)；
      itemA5 已报价但缺填报人，其余资料齐全 → tier(0,1,0,0)。

    预期排序：A3 > A5 > A2 > A4。

    B组（sales_b1，权限隔离用）：
      itemF1 完整款式。
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

        inqA1 = await make_inq("TESTOV-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 9, 1), "下单", "已报价")
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTOV-A1", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 100,
            "quote_prepared_by": "李四", "process_description": "UV50+", "size_range": "S-XL",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA1.id, process_tag="UV50+", is_special=False))
        db.add(InquiryItemSize(inquiry_item_id=itemA1.id, size_code="M", is_special_size=False))

        inqA2 = await make_inq("TESTOV-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 9, 2), "跟进中", "未报价")
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTOV-A2", {
            "product_name": "完全缺资料款式", "product_category": "泳装",
        })

        inqA3 = await make_inq("TESTOV-A3", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 9, 3), "下单", "未报价")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTOV-A3", {
            "product_name": "已下单缺资料款式", "product_category": "泳装",
        })

        inqA4 = await make_inq("TESTOV-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 9, 4), "跟进中", "未报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTOV-A4", {
            "style_no": "A004", "product_name": "特殊工艺无说明款式", "product_category": "泳装", "quantity": 30,
            "quote_prepared_by": "李四", "size_range": "S-XL",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA4.id, process_tag="镭射雕花", is_special=True))
        db.add(InquiryItemSize(inquiry_item_id=itemA4.id, size_code="M", is_special_size=False))

        inqA5 = await make_inq("TESTOV-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 9, 5), "跟进中", "已报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTOV-A5", {
            "style_no": "A005", "product_name": "已报价缺填报人款式", "product_category": "泳装", "quantity": 40,
            "process_description": "热压", "size_range": "S-XL",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA5.id, process_tag="热压", is_special=False))
        db.add(InquiryItemSize(inquiry_item_id=itemA5.id, size_code="M", is_special_size=False))

        inqF1 = await make_inq("TESTOV-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装",
                                date(2026, 9, 6), "跟进中", "已报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTOV-F1", {
            "style_no": "F001", "product_name": "防水外套", "product_category": "泳装", "quantity": 15,
            "quote_prepared_by": "赵六", "process_description": "防水涂层", "size_range": "M",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemF1.id, process_tag="防水涂层", is_special=False))
        db.add(InquiryItemSize(inquiry_item_id=itemF1.id, size_code="M", is_special_size=False))

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id), "itemF1": str(itemF1.id),
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景2：总览卡片与子分析页面口径一致 ──────────────────────────────
        header("场景2：总览卡片与子分析页面口径一致")
        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview",
                                  params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        overview = resp.json()

        resp_qdq = await client.get(f"{BASE}/analytics/quote-data-quality", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        qdq = resp_qdq.json()
        check(overview["summary"]["total_style_items"] == qdq["summary"]["total_inquiry_items"],
              f"总览 total_style_items 与 quote-data-quality 口径一致（{overview['summary']['total_style_items']} vs {qdq['summary']['total_inquiry_items']}）")
        check(abs(overview["summary"]["overall_completeness_rate"] - qdq["summary"]["overall_completeness_rate"]) < 0.0001,
              "总览整体完整率与 quote-data-quality 口径一致")
        check(overview["summary"]["items_needing_completion"] ==
              qdq["summary"]["partially_complete_items"] + qdq["summary"]["high_missing_items"],
              "总览待补录款式数 == 部分完整 + 高缺失")

        resp_ccs = await client.get(f"{BASE}/analytics/customer-category-styles", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        ccs = resp_ccs.json()
        check(overview["summary"]["customer_count"] == ccs["summary"]["total_customers"], "总览客户数与 customer-category-styles 口径一致")
        check(overview["summary"]["category_count"] == ccs["summary"]["total_categories"], "总览品类数与 customer-category-styles 口径一致")

        resp_pa = await client.get(f"{BASE}/analytics/processes", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        pa = resp_pa.json()
        check(overview["summary"]["unique_process_tags"] == pa["summary"]["unique_process_tags"], "总览工艺标签种类数与 process-analysis 口径一致")

        resp_sa = await client.get(f"{BASE}/analytics/sizes", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        sa = resp_sa.json()
        check(overview["summary"]["unique_size_codes"] == sa["summary"]["unique_size_codes"], "总览尺码种类数与 size-analysis 口径一致")

        resp_qa = await client.get(f"{BASE}/analytics/quote-quantity", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        qa = resp_qa.json()
        check(overview["summary"]["items_with_quantity"] == qa["summary"]["items_with_quantity"], "总览有数量款式数与 quote-quantity 口径一致")

        resp_qp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        qp = resp_qp.json()
        check(overview["summary"]["items_with_quote_preparer"] == qp["summary"]["items_with_preparer"], "总览已填写填报人款式数与 quote-preparers 口径一致")

        # ── 场景3：key_gaps 覆盖率和优先级 ───────────────────────────────────
        header("场景3：key_gaps 覆盖率和优先级")
        gaps_by_key = {g["field_key"]: g for g in overview["key_gaps"]}
        qdq_cov_by_key = {f["field_key"]: f for f in qdq["field_coverage"]}
        check(len(overview["key_gaps"]) == len(qdq["field_coverage"]), "key_gaps 条数与 field_coverage 一致（不裁剪字段）")
        for key, gap in gaps_by_key.items():
            cov = qdq_cov_by_key[key]
            check(gap["coverage_rate"] == cov["coverage_rate"] and gap["missing_count"] == cov["missing_count"],
                  f"{key} 覆盖率/缺失数与 field_coverage 一致")
            expected_level = "high" if cov["coverage_rate"] < 0.5 else ("medium" if cov["coverage_rate"] < 0.8 else "low")
            check(gap["priority_level"] == expected_level, f"{key} 优先级正确（覆盖率 {cov['coverage_rate']} → {expected_level}，实际 {gap['priority_level']}）")
            check(gap["target_module"] == "/quote-data-quality", f"{key} target_module 指向 /quote-data-quality")
        check(overview["key_gaps"] == sorted(overview["key_gaps"], key=lambda g: g["coverage_rate"]), "key_gaps 按覆盖率升序排列（最缺的排最前）")

        # ── 场景4：priority_items 去重排序 ───────────────────────────────────
        header("场景4：priority_items 去重排序")
        priority = overview["priority_items"]
        item_ids_in_list = [p["item_id"] for p in priority]
        check(len(item_ids_in_list) == len(set(item_ids_in_list)), "priority_items 中每个 item_id 只出现一次（已去重）")
        check(ids["itemA1"] not in item_ids_in_list, "完整款式（A1）不出现在优先处理清单中")

        expected_order = [ids["itemA3"], ids["itemA5"], ids["itemA2"], ids["itemA4"]]
        actual_order = [p["item_id"] for p in priority if p["item_id"] in expected_order]
        check(actual_order == expected_order, f"排序正确：A3(已下单+缺四项) > A5(已报价缺填报人) > A2(缺四项) > A4(仅风险提示)（实际 {actual_order}）")

        a3_entry = next(p for p in priority if p["item_id"] == ids["itemA3"])
        check(set(a3_entry["missing_fields"]) == {"款号", "工艺", "尺码", "填报人", "数量"}, f"A3 missing_fields 正确（实际 {a3_entry['missing_fields']}）")
        a4_entry = next(p for p in priority if p["item_id"] == ids["itemA4"])
        check(a4_entry["missing_fields"] == [], f"A4（仅特殊工艺缺说明，其余资料齐全）missing_fields 应为空（实际 {a4_entry['missing_fields']}）")
        check(a4_entry["risk_hint"] != "", "A4 risk_hint 非空（来自工艺风险信号）")

        # ── 各模块亮点存在性检查 ──────────────────────────────────────────────
        header("场景：各模块亮点")
        check(len(overview["top_customer_categories"]) <= 5, "客户品类亮点最多 5 条")
        check(len(overview["top_processes"]) <= 5, "工艺亮点最多 5 条")
        check(len(overview["top_sizes"]) <= 5, "尺码亮点最多 5 条")
        check(len(overview["quantity_distribution_highlights"]) == 1, "数量结构亮点返回 1 条摘要")
        check(len(overview["preparer_highlights"]) == 1, "填报人亮点返回 1 条摘要")
        check(len(overview["module_links"]) == 6, f"module_links 包含 6 个细分模块（实际 {len(overview['module_links'])}）")
        qty_hl = overview["quantity_distribution_highlights"][0]
        check(qty_hl["items_without_quantity"] == qa["summary"]["items_without_quantity"], "数量亮点缺数量款式数与 quote-quantity 一致")
        prep_hl = overview["preparer_highlights"][0]
        check(prep_hl["items_without_preparer"] == qp["summary"]["items_without_preparer"], "填报人亮点未填写款式数与 quote-preparers 一致")

        # ── 场景6：筛选条件同时作用于所有汇总区块 ────────────────────────────
        header("场景6：筛选条件同时作用于所有汇总区块")
        resp2 = await client.get(f"{BASE}/analytics/quote-analysis-overview",
                                   params={"customer_code": "CCT01", "product_category": "内衣"}, headers=h("demo_admin"))
        narrowed = resp2.json()
        check(narrowed["summary"]["total_style_items"] == 0, f"用不存在的品类筛选后总览各区块归零（实际 {narrowed['summary']['total_style_items']}）")
        check(narrowed["priority_items"] == [], "筛选后 priority_items 也归零")
        check(narrowed["top_processes"] == [], "筛选后工艺亮点也归零")

        # ── 场景1：权限过滤 ──────────────────────────────────────────────────
        header("场景1：权限过滤")
        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT03"}, headers=h("demo_admin"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"admin 可见 DEF 客户 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT03"}, headers=h("a_leader"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"A组组长看不到 B组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT03"}, headers=h("b_leader"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"B组组长可见本组 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT01"}, headers=h("sales_a1"))
        check(resp.json()["summary"]["total_style_items"] == 5, f"sales_a1 可见自己负责的 5 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT01"}, headers=h("sales_a2"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"sales_a2（无关）看不到数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview", params={"customer_code": "CCT01"}, headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        check(resp.json()["summary"]["total_style_items"] == 5, f"viewer（A组）可见本组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(
            f"{BASE}/analytics/quote-analysis-overview", headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景5：空数据时结构稳定 ──────────────────────────────────────────
        header("场景5：空数据时结构稳定")
        resp = await client.get(f"{BASE}/analytics/quote-analysis-overview",
                                  params={"customer_code": "NOSUCHCUSTOMER"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空数据时仍返回 200（实际 {resp.status_code}）")
        empty = resp.json()
        check(empty["summary"]["total_style_items"] == 0, "空数据 total_style_items == 0")
        check(len(empty["key_gaps"]) == 10, f"空数据时 key_gaps 仍返回全部 10 个字段（实际 {len(empty['key_gaps'])}）")
        check(empty["top_customer_categories"] == [], "空数据 top_customer_categories == []")
        check(empty["priority_items"] == [], "空数据 priority_items == []")
        check(len(empty["module_links"]) == 6, "空数据时 module_links 仍返回 6 个固定链接")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
