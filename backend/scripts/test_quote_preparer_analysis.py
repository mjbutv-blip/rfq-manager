"""
报价资料分析 Step 9 —— 报价单填报人 / 人员维度分析 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第十四节列出的场景：填报人空值归类 / 款式数询单数客户数品类数统计 /
按客户品类数量区间统计 / 填报人与负责业务员相同或不同统计 / 数据完整率 /
数据质量提示 / 权限过滤 / 空数据稳定性 / priority_items 排序。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_quote_preparer_analysis.py

会写入以 TESTQP- 为前缀的测试询单，结束后自动清理。
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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTQP-%"))
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
    A组（sales_a1 负责）：
      itemA1 ABC/泳装 quote_prepared_by="李四"（与 sales_a1 不同），有工艺标签，已下单
      itemA2 ABC/泳装 quote_prepared_by="李四"，已报价
      itemA3 ABC/内衣 quote_prepared_by="sales_a1"（与负责业务员相同，same_person=True）
      itemA4 ABC/泳装 quote_prepared_by=""（未填写），已下单            → 优先补录 tier2
      itemA5 ABC/泳装 quote_prepared_by="  "（全空格），已报价（非已下单） → 优先补录 tier1
      itemA6-A9（4条，"王五"填报，全部缺工艺/尺码/数量，凑 data_completeness_rate<0.5）

    B组（sales_b1，权限隔离用）：
      itemF1 DEF/泳装 quote_prepared_by="赵六"
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

        inqA1 = await make_inq("TESTQP-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 8, 1), "下单", "已报价")
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTQP-A1", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 100,
            "quote_prepared_by": "李四", "process_description": "UV50+",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA1.id, process_tag="UV50+", is_special=False))

        inqA2 = await make_inq("TESTQP-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 8, 2), "跟进中", "已报价")
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTQP-A2", {
            "style_no": "A002", "product_name": "连体泳衣", "product_category": "泳装", "quantity": 80,
            "quote_prepared_by": "李四",
        })

        inqA3 = await make_inq("TESTQP-A3", "CCT01", "ABC客户", "A组", "sales_a1", "内衣",
                                date(2026, 8, 3), "跟进中", "未报价")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTQP-A3", {
            "style_no": "A003", "product_name": "运动内衣", "product_category": "内衣", "quantity": 50,
            "quote_prepared_by": "sales_a1",
        })

        inqA4 = await make_inq("TESTQP-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 8, 4), "下单", "已报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTQP-A4", {
            "style_no": "A004", "product_name": "泳裤", "product_category": "泳装", "quantity": 30,
            "quote_prepared_by": "",
        })

        inqA5 = await make_inq("TESTQP-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装",
                                date(2026, 8, 5), "跟进中", "已报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTQP-A5", {
            "style_no": "A005", "product_name": "防晒衣", "product_category": "泳装", "quantity": 20,
            "quote_prepared_by": "   ",
        })

        # 王五：5 条款式，全部缺工艺/尺码/填报人之外的字段（只填了品名+数量+填报人），
        # 用于触发"填报人资料完整率较低"（style_count=5 >= 5，completeness < 0.5）。
        wang_item_ids = []
        for i in range(5):
            inqW = await make_inq(f"TESTQP-W{i+1}", "CCT02", "XYZ客户", "A组", "sales_a1", "运动",
                                    date(2026, 8, 6), "跟进中", "未报价")
            itemW = await crud.create_inquiry_item(db, inqW.id, inqW.inquiry_no, {
                "product_name": f"运动文胸{i+1}", "product_category": "运动", "quantity": 60 + i,
                "quote_prepared_by": "王五",
            })
            wang_item_ids.append(str(itemW.id))

        inqF1 = await make_inq("TESTQP-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装",
                                date(2026, 8, 7), "跟进中", "已报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTQP-F1", {
            "style_no": "F001", "product_name": "防水外套", "product_category": "泳装", "quantity": 15,
            "quote_prepared_by": "赵六",
        })

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id), "itemF1": str(itemF1.id),
            "wang_item_ids": wang_item_ids,
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1：填报人空值统一归类 ──────────────────────────────────────
        header("场景1：填报人空值统一归类'未填写填报人'")
        resp = await client.get(f"{BASE}/analytics/quote-preparers",
                                  params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_style_items"] == 5, f"ABC total_style_items == 5（实际 {data['summary']['total_style_items']}）")
        check(data["summary"]["items_without_preparer"] == 2, f"未填写填报人 2 条（A4空字符串+A5全空格，实际 {data['summary']['items_without_preparer']}）")
        check(data["summary"]["items_with_preparer"] == 3, f"已填写填报人 3 条（A1/A2/A3，实际 {data['summary']['items_with_preparer']}）")

        unfilled = next((p for p in data["preparer_rankings"] if p["quote_prepared_by"] == "未填写填报人"), None)
        check(unfilled is not None and unfilled["style_count"] == 2, f"'未填写填报人'未被静默排除，仍出现在排名中且 style_count==2（实际 {unfilled}）")
        check(data["summary"]["unique_preparer_count"] == 2, f"填报人数 == 2（李四/sales_a1，不含'未填写'，实际 {data['summary']['unique_preparer_count']}）")

        # ── 场景2：款式数/询单数/客户数/品类数统计 ──────────────────────────
        header("场景2：填报人款式数/询单数/客户数/品类数统计")
        lisi = next(p for p in data["preparer_rankings"] if p["quote_prepared_by"] == "李四")
        check(lisi["style_count"] == 2, f"李四 style_count == 2（A1/A2，实际 {lisi['style_count']}）")
        check(lisi["inquiry_count"] == 2, f"李四 inquiry_count == 2（实际 {lisi['inquiry_count']}）")
        check(lisi["customer_count"] == 1, f"李四 customer_count == 1（实际 {lisi['customer_count']}）")
        check(lisi["category_count"] == 1, f"李四 category_count == 1（泳装，实际 {lisi['category_count']}）")
        check(lisi["quantity_total"] == 180, f"李四 quantity_total == 180（100+80，实际 {lisi['quantity_total']}）")

        # ── 场景4：填报人与负责业务员相同/不同统计 ──────────────────────────
        header("场景4：填报人与负责业务员相同/不同统计")
        check(data["summary"]["items_where_preparer_differs_from_responsible_sales"] == 2, f"填报人与负责业务员不同 == 2（A1/A2 李四≠sales_a1，实际 {data['summary']['items_where_preparer_differs_from_responsible_sales']}）")

        sales_a1_same = next(
            (r for r in data["by_responsible_sales"] if r["responsible_sales"] == "sales_a1" and r["quote_prepared_by"] == "sales_a1"), None,
        )
        check(sales_a1_same is not None and sales_a1_same["same_person"] is True, f"sales_a1 自己填报时 same_person==True（实际 {sales_a1_same}）")
        sales_a1_diff = next(
            (r for r in data["by_responsible_sales"] if r["responsible_sales"] == "sales_a1" and r["quote_prepared_by"] == "李四"), None,
        )
        check(sales_a1_diff is not None and sales_a1_diff["same_person"] is False, f"sales_a1 负责但李四填报时 same_person==False（实际 {sales_a1_diff}）")

        # ── 场景3：按客户、按品类、按数量区间统计 ────────────────────────────
        header("场景3：按客户/按品类/按数量区间统计")
        lisi_abc = next(c for c in data["by_customer"] if c["quote_prepared_by"] == "李四" and c["customer_code"] == "CCT01")
        check(lisi_abc["style_count"] == 2, f"李四×ABC style_count == 2（实际 {lisi_abc['style_count']}）")

        lisi_swim = next(c for c in data["by_category"] if c["quote_prepared_by"] == "李四" and c["product_category"] == "泳装")
        check(lisi_swim["style_count"] == 2, f"李四×泳装 style_count == 2（实际 {lisi_swim['style_count']}）")
        check(abs(lisi_swim["style_share_in_preparer"] - 1.0) < 0.001, f"李四×泳装 占比 == 1.0（李四全部款式都是泳装，实际 {lisi_swim['style_share_in_preparer']}）")

        lisi_bucket = next(b for b in data["by_quantity_bucket"] if b["quote_prepared_by"] == "李四" and b["quantity_bucket"] == "1–99")
        check(lisi_bucket["style_count"] == 1, f"李四 1–99 区间 == 1（A2=80，实际 {lisi_bucket['style_count']}）")

        # ── 场景5：数据完整率 ────────────────────────────────────────────────
        header("场景5：数据完整率计算")
        # 李四的 A1（完整：品名+数量+填报人+工艺标签，但缺尺码）不算 complete；
        # A1/A2 都缺尺码资料，所以李四的 data_completeness_rate 应为 0（无一条同时满足完整六项）
        check(lisi["data_completeness_rate"] == 0.0, f"李四完整率 == 0（A1/A2 都缺尺码，按 Step4 口径不算完整，实际 {lisi['data_completeness_rate']}）")

        # ── 场景7：填报人资料完整率低提示 ────────────────────────────────────
        header("场景7：填报人资料完整率低提示")
        resp = await client.get(f"{BASE}/analytics/quote-preparers",
                                  params={"group_name": "A组"}, headers=h("demo_admin"))
        full_data = resp.json()
        wangwu = next(p for p in full_data["preparer_rankings"] if p["quote_prepared_by"] == "王五")
        check(wangwu["style_count"] == 5, f"王五 style_count == 5（实际 {wangwu['style_count']}）")
        check(wangwu["data_completeness_rate"] < 0.5, f"王五完整率 < 0.5（实际 {wangwu['data_completeness_rate']}）")
        low_sig = next(s for s in full_data["data_quality_signals"] if s["signal_type"] == "low_completeness_preparer")
        check(low_sig["style_count"] == 5, f"低完整率提示涉及款式数 == 5（王五全部款式，实际 {low_sig['style_count']}）")

        # ── 场景6：已报价/已下单但缺填报人提示 ───────────────────────────────
        header("场景6：已报价/已下单但缺填报人提示")
        priority_sig = next(s for s in data["data_quality_signals"] if s["signal_type"] == "priority_no_preparer")
        check(priority_sig["style_count"] == 2, f"已报价或已下单缺填报人提示 == 2（A4已下单 + A5已报价，实际 {priority_sig['style_count']}）")
        collab_sig = next(s for s in data["data_quality_signals"] if s["signal_type"] == "collaboration")
        check(collab_sig["style_count"] == 2, f"协作分布提示 == 2（与上面 differs 一致，实际 {collab_sig['style_count']}）")

        # ── 场景10：priority_items 排序 ──────────────────────────────────────
        header("场景10：priority_items 排序")
        priority = data["priority_items"]
        check(len(priority) == 2, f"优先补录清单包含 2 条（A4/A5，实际 {len(priority)}）")
        check(priority[0]["item_id"] == ids["itemA4"], f"已下单缺填报人（A4）排第一（实际 {priority[0]['item_id']}）")
        check(priority[1]["item_id"] == ids["itemA5"], f"已报价缺填报人（A5）排第二（实际 {priority[1]['item_id']}）")
        check(not any(p["item_id"] in (ids["itemA1"], ids["itemA2"], ids["itemA3"]) for p in priority), "已填写填报人的款式不出现在优先补录清单中")
        check(priority[0]["missing_fields"] == ["报价单填报人"], f"missing_fields 正确（实际 {priority[0]['missing_fields']}）")
        check(priority[0]["risk_hint"] == "已报价或已下单款式缺少报价单填报人，建议补录", f"A4 风险提示正确（实际 {priority[0]['risk_hint']}）")

        # ── min_item_count 过滤 ──────────────────────────────────────────────
        header("场景：min_item_count 过滤")
        resp = await client.get(f"{BASE}/analytics/quote-preparers",
                                  params={"group_name": "A组", "min_item_count": 3}, headers=h("demo_admin"))
        filtered = resp.json()
        filtered_names = {p["quote_prepared_by"] for p in filtered["preparer_rankings"]}
        check("王五" in filtered_names, f"min_item_count=3 时王五（5条）仍保留（实际 {filtered_names}）")
        check("李四" not in filtered_names, f"min_item_count=3 时李四（2条）被过滤（实际 {filtered_names}）")
        check(filtered["summary"]["total_style_items"] == full_data["summary"]["total_style_items"], "min_item_count 不影响总览口径")

        # ── 场景8：权限过滤 ──────────────────────────────────────────────────
        header("场景8：权限过滤")
        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT03"}, headers=h("demo_admin"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"admin 可见 DEF 客户 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT03"}, headers=h("a_leader"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"A组组长看不到 B组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT03"}, headers=h("b_leader"))
        check(resp.json()["summary"]["total_style_items"] == 1, f"B组组长可见本组 1 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT01"}, headers=h("sales_a1"))
        check(resp.json()["summary"]["total_style_items"] == 5, f"sales_a1 可见自己负责的 5 条（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT01"}, headers=h("sales_a2"))
        check(resp.json()["summary"]["total_style_items"] == 0, f"sales_a2（无关）看不到数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(f"{BASE}/analytics/quote-preparers", params={"customer_code": "CCT01"}, headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        check(resp.json()["summary"]["total_style_items"] == 5, f"viewer（A组）可见本组数据（实际 {resp.json()['summary']['total_style_items']}）")

        resp = await client.get(
            f"{BASE}/analytics/quote-preparers", headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景9：空数据时结构稳定 ──────────────────────────────────────────
        header("场景9：空数据时结构稳定")
        resp = await client.get(f"{BASE}/analytics/quote-preparers",
                                  params={"customer_code": "NOSUCHCUSTOMER"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空数据时仍返回 200（实际 {resp.status_code}）")
        empty = resp.json()
        check(empty["summary"]["total_style_items"] == 0, "空数据 total_style_items == 0")
        check(empty["summary"]["top_preparer"] is None, "空数据 top_preparer 返回 None")
        check(empty["preparer_rankings"] == [], "空数据 preparer_rankings == []")
        check(len(empty["data_quality_signals"]) == 3, f"空数据时数据质量提示仍返回 3 类，实际 {len(empty['data_quality_signals'])}")
        check(all(s["style_count"] == 0 for s in empty["data_quality_signals"]), "空数据各提示计数全部为 0")
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
