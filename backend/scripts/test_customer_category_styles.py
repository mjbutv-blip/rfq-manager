"""
报价资料分析 Step 5 —— 客户 × 品类 × 款式分析 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），
覆盖需求文档第十四节列出的场景：款式数统计 / style_no 去重 / 退化统计 /
未知款式 / 客户内品类占比 / 客户排名 / 品类排名 / 客户偏好类型 / 潜在重复款 / 权限过滤。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_customer_category_styles.py

会写入以 TESTCC- 为前缀的测试询单，结束后自动清理。
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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTCC-%"))
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
    数据布局（全部 A组/sales_a1 负责，除专门测权限的 CCT03 在 B组/sales_b1）：

      询单A TESTCC-001（客户 ABC / CCT01）：
        itemA1 style_no=A001 泳装 qty=100
        itemA2 style_no=A001 泳装 qty=50   —— 与 itemA1 同 style_no，潜在重复款
        itemA3 style_no=A002 泳装 qty=80
        itemA4 style_no=A003 泳装 qty=60
        itemA5 style_no=B001 内衣 qty=40
      询单C TESTCC-003（客户 ABC / CCT01，无 style_no 也无 product_name）：
        itemC1 泳装 qty=10                  —— 未知款式
      询单E TESTCC-005（客户 ABC / CCT01，item/inquiry 两级 product_category 都为空）：
        itemE1 style_no=E001 qty=5          —— 未填写品类

      ABC 合计：distinct style = {A001,A002,A003,B001,unknown(C1),E001} = 6
        泳装：A001,A002,A003,unknown(C1) = 4
        内衣：B001 = 1
        未填写品类：E001 = 1
        → top1_share = 4/6 ≈ 0.667 ≥ 0.6 → 品类集中

      询单B TESTCC-002（客户 XYZ / CCT02）：
        itemB1 style_no=C001 泳装 qty=70
        itemB2 style_no=C002 内衣 qty=30
        itemB3 style_no=C003 运动 qty=20
      XYZ 合计：distinct style = 3，3 个品类各 1 → top1_share=1/3 <0.6，品类数=3 → 品类均衡

      询单D TESTCC-004（customer_code/customer_short_name 都为空）：
        itemD1 style_no=D001 泳装 qty=5      —— 未知客户，且总款式数=1<3 → 样本不足

      询单F TESTCC-006（客户 DEF / CCT03，B组/sales_b1，用于权限测试）：
        itemF1 style_no=F001 泳装 qty=15

    total_style_items = 5+1+1+3+1+1 = 12；known=11（仅 itemC1 未知）。
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        inqA = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-001", "customer_code": "CCT01", "customer_short_name": "ABC客户",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_category": "泳装", "product_name": "ABC泳装询单", "quantity": 100,
            "inquiry_date": date(2026, 3, 1), "order_status": "跟进中",
        })
        itemA1 = await crud.create_inquiry_item(db, inqA.id, "TESTCC-001", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 100,
        })
        itemA2 = await crud.create_inquiry_item(db, inqA.id, "TESTCC-001", {
            "style_no": "A001", "product_name": "三角比基尼", "product_category": "泳装", "quantity": 50,
        })
        itemA3 = await crud.create_inquiry_item(db, inqA.id, "TESTCC-001", {
            "style_no": "A002", "product_name": "连体泳衣", "product_category": "泳装", "quantity": 80,
        })
        itemA4 = await crud.create_inquiry_item(db, inqA.id, "TESTCC-001", {
            "style_no": "A003", "product_name": "泳裤", "product_category": "泳装", "quantity": 60,
        })
        itemA5 = await crud.create_inquiry_item(db, inqA.id, "TESTCC-001", {
            "style_no": "B001", "product_name": "运动内衣", "product_category": "内衣", "quantity": 40,
        })

        inqC = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-003", "customer_code": "CCT01", "customer_short_name": "ABC客户",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_category": "泳装", "product_name": "ABC未知款式询单", "quantity": 10,
            "inquiry_date": date(2026, 3, 5), "order_status": "跟进中",
        })
        itemC1 = await crud.create_inquiry_item(db, inqC.id, "TESTCC-003", {
            "product_category": "泳装", "quantity": 10,
        })

        inqE = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-005", "customer_code": "CCT01", "customer_short_name": "ABC客户",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_category": None, "product_name": "ABC未填品类询单", "quantity": 5,
            "inquiry_date": date(2026, 3, 8), "order_status": "跟进中",
        })
        itemE1 = await crud.create_inquiry_item(db, inqE.id, "TESTCC-005", {
            "style_no": "E001", "quantity": 5,
        })

        inqB = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-002", "customer_code": "CCT02", "customer_short_name": "XYZ客户",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_category": "泳装", "product_name": "XYZ询单", "quantity": 70,
            "inquiry_date": date(2026, 3, 2), "order_status": "跟进中",
        })
        itemB1 = await crud.create_inquiry_item(db, inqB.id, "TESTCC-002", {
            "style_no": "C001", "product_category": "泳装", "quantity": 70,
        })
        itemB2 = await crud.create_inquiry_item(db, inqB.id, "TESTCC-002", {
            "style_no": "C002", "product_category": "内衣", "quantity": 30,
        })
        itemB3 = await crud.create_inquiry_item(db, inqB.id, "TESTCC-002", {
            "style_no": "C003", "product_category": "运动", "quantity": 20,
        })

        inqD = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-004", "customer_code": None, "customer_short_name": None,
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_category": "泳装", "product_name": "未知客户询单", "quantity": 5,
            "inquiry_date": date(2026, 3, 3), "order_status": "跟进中",
        })
        itemD1 = await crud.create_inquiry_item(db, inqD.id, "TESTCC-004", {
            "style_no": "D001", "product_category": "泳装", "quantity": 5,
        })

        inqF = await crud.create_inquiry(db, {
            "inquiry_no": "TESTCC-006", "customer_code": "CCT03", "customer_short_name": "DEF客户",
            "group_name": "B组", "responsible_sales": "sales_b1",
            "product_category": "泳装", "product_name": "DEF询单", "quantity": 15,
            "inquiry_date": date(2026, 3, 4), "order_status": "跟进中",
        })
        itemF1 = await crud.create_inquiry_item(db, inqF.id, "TESTCC-006", {
            "style_no": "F001", "product_category": "泳装", "quantity": 15,
        })

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id),
            "itemB1": str(itemB1.id), "itemB2": str(itemB2.id), "itemB3": str(itemB3.id),
            "itemC1": str(itemC1.id), "itemD1": str(itemD1.id), "itemE1": str(itemE1.id),
            "itemF1": str(itemF1.id),
            "inqA_no": inqA.inquiry_no,
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1-4：款式数统计 / style_no 去重 / 退化统计 / 未知款式 ─────────
        header("场景1-4：款式数统计 / 去重 / 退化 / 未知款式")
        resp = await client.get(f"{BASE}/analytics/customer-category-styles",
                                  params={"group_name": "A组"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"接口返回 200（实际 {resp.status_code}）")
        data = resp.json()

        check(data["summary"]["total_style_items"] == 11, f"A组 total_style_items == 11（实际 {data['summary']['total_style_items']}）")
        check(data["summary"]["unknown_style_count"] == 1, f"未知款式数 == 1（实际 {data['summary']['unknown_style_count']}）")
        check(data["summary"]["known_style_count"] == 10, f"已识别款式数 == 10（实际 {data['summary']['known_style_count']}）")

        abc = next(c for c in data["customer_rankings"] if c["customer_code"] == "CCT01")
        check(abc["style_count"] == 6, f"ABC 去重后款式数 == 6（A001 去重，实际 {abc['style_count']}）")
        check(abc["category_count"] == 3, f"ABC 品类数 == 3（泳装/内衣/未填写品类，实际 {abc['category_count']}）")

        matrix_abc_swim = next(
            m for m in data["customer_category_matrix"]
            if m["customer_code"] == "CCT01" and m["product_category"] == "泳装"
        )
        check(matrix_abc_swim["style_count"] == 4, f"ABC×泳装 款式数 == 4（含 1 条未知款式，实际 {matrix_abc_swim['style_count']}）")
        check(matrix_abc_swim["unknown_style_count"] == 1, f"ABC×泳装 未知款式数 == 1（实际 {matrix_abc_swim['unknown_style_count']}）")
        check(matrix_abc_swim["item_count"] == 5, f"ABC×泳装 明细行数 == 5（A001 重复计 2 行 + A002+A003+unknown，实际 {matrix_abc_swim['item_count']}）")

        unfilled_cat = next(
            (m for m in data["customer_category_matrix"]
             if m["customer_code"] == "CCT01" and m["product_category"] == "未填写品类"), None,
        )
        check(unfilled_cat is not None and unfilled_cat["style_count"] == 1, "item/inquiry 两级品类都缺失时归入'未填写品类'且不被静默排除")

        # ── 场景5：客户内品类占比 ──────────────────────────────────────────────
        header("场景5：客户内品类占比")
        check(
            abs(matrix_abc_swim["style_share_in_customer"] - 4 / 6) < 0.001,
            f"ABC×泳装 客户内占比 == 4/6（实际 {matrix_abc_swim['style_share_in_customer']}）",
        )

        # ── 场景6：客户排名 ──────────────────────────────────────────────────
        header("场景6：客户排名")
        check(data["customer_rankings"][0]["customer_code"] == "CCT01", "客户排名第一为款式数最多的 ABC")
        check(abc["top_category"] == "泳装", f"ABC top_category == 泳装（实际 {abc['top_category']}）")
        check(abs(abc["top_category_share"] - 4 / 6) < 0.001, f"ABC top_category_share == 4/6（实际 {abc['top_category_share']}）")

        # ── 场景7：品类排名 ──────────────────────────────────────────────────
        header("场景7：品类排名")
        swim_rank = next(c for c in data["category_rankings"] if c["product_category"] == "泳装")
        # 泳装总款式数 = ABC(4) + XYZ(1) + 未知客户(1) = 6
        check(swim_rank["style_count"] == 6, f"泳装品类总款式数 == 6（实际 {swim_rank['style_count']}）")
        check(swim_rank["customer_count"] == 3, f"泳装品类涉及客户数 == 3（实际 {swim_rank['customer_count']}）")

        # ── 场景8：客户偏好画像 ──────────────────────────────────────────────
        header("场景8：客户偏好画像")
        abc_profile = next(p for p in data["customer_preference_profiles"] if p["customer_code"] == "CCT01")
        check(abc_profile["preference_type"] == "品类集中", f"ABC 偏好类型 == 品类集中（实际 {abc_profile['preference_type']}）")
        check(len(abc_profile["notes"]) >= 1, "ABC 偏好画像生成了说明文字")

        xyz_profile = next(p for p in data["customer_preference_profiles"] if p["customer_code"] == "CCT02")
        check(xyz_profile["preference_type"] == "品类均衡", f"XYZ 偏好类型 == 品类均衡（实际 {xyz_profile['preference_type']}）")

        unknown_profile = next(
            (p for p in data["customer_preference_profiles"] if p["customer_short_name"] == "未知客户"), None,
        )
        check(unknown_profile is not None, "未知客户也出现在偏好画像列表中（不被静默排除）")
        check(unknown_profile["preference_type"] == "样本不足", f"未知客户（总款式数1）偏好类型 == 样本不足（实际 {unknown_profile['preference_type']}）")

        # ── 场景9：潜在重复款 ──────────────────────────────────────────────
        header("场景9：潜在重复款")
        dup = next((d for d in data["potential_duplicate_styles"] if d["customer_code"] == "CCT01" and d["style_key"] == "A001"), None)
        check(dup is not None, "ABC 客户下 A001 被识别为潜在重复款")
        check(dup is not None and dup["duplicate_count"] == 2, f"A001 重复次数 == 2（实际 {dup['duplicate_count'] if dup else None}）")
        check(dup is not None and set(dup["item_ids"]) == {ids["itemA1"], ids["itemA2"]}, "重复款 item_ids 指向正确的两条明细")

        # ── 场景：影响分析准确性的缺失资料清单 ──────────────────────────────
        header("场景：缺失资料清单")
        priority_ids = {p["item_id"] for p in data["priority_items"]}
        check(ids["itemC1"] in priority_ids, "未知款式（itemC1）出现在缺失资料清单中")
        check(ids["itemD1"] in priority_ids, "未知客户款式（itemD1）出现在缺失资料清单中")
        check(ids["itemE1"] in priority_ids, "未填写品类款式（itemE1）出现在缺失资料清单中")
        item_c1_entry = next(p for p in data["priority_items"] if p["item_id"] == ids["itemC1"])
        check("款号或品名+系列" in item_c1_entry["missing_fields"], f"itemC1 缺失字段正确（实际 {item_c1_entry['missing_fields']}）")

        # ── min_style_count 过滤 ──────────────────────────────────────────
        header("场景：min_style_count 过滤")
        resp = await client.get(f"{BASE}/analytics/customer-category-styles",
                                  params={"group_name": "A组", "min_style_count": 4}, headers=h("demo_admin"))
        filtered = resp.json()
        check(len(filtered["customer_category_matrix"]) == 1, f"min_style_count=4 时矩阵只剩 1 条（实际 {len(filtered['customer_category_matrix'])}）")
        check(len(filtered["customer_rankings"]) == 1, f"min_style_count=4 时客户排名只剩 1 条（实际 {len(filtered['customer_rankings'])}）")
        check(filtered["summary"]["total_style_items"] == 11, "min_style_count 不影响总览口径")
        check(len(filtered["customer_preference_profiles"]) >= 3, "min_style_count 不影响偏好画像清单")

        # ── 场景10：权限过滤 ──────────────────────────────────────────────
        header("场景10：权限过滤")
        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("demo_admin"))
        admin_total = resp.json()["summary"]["total_style_items"]
        check(admin_total == 12, f"admin 可见全部 12 条（实际 {admin_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("a_leader"))
        a_leader_total = resp.json()["summary"]["total_style_items"]
        check(a_leader_total == 11, f"A组组长可见本组 11 条（实际 {a_leader_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("b_leader"))
        b_leader_total = resp.json()["summary"]["total_style_items"]
        check(b_leader_total == 1, f"B组组长只看到本组 1 条（实际 {b_leader_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("sales_a1"))
        sales_a1_total = resp.json()["summary"]["total_style_items"]
        check(sales_a1_total == 11, f"sales_a1（负责全部 A组询单）可见 11 条（实际 {sales_a1_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("sales_b1"))
        sales_b1_total = resp.json()["summary"]["total_style_items"]
        check(sales_b1_total == 1, f"sales_b1 只看到自己负责的 1 条（实际 {sales_b1_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("sales_a2"))
        sales_a2_total = resp.json()["summary"]["total_style_items"]
        check(sales_a2_total == 0, f"sales_a2（与这些询单无关）看不到数据（实际 {sales_a2_total}）")

        resp = await client.get(f"{BASE}/analytics/customer-category-styles", headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可查看（只读）")
        viewer_total = resp.json()["summary"]["total_style_items"]
        check(viewer_total == 11, f"viewer（A组）可见本组数据（实际 {viewer_total}）")

        resp = await client.get(
            f"{BASE}/analytics/customer-category-styles",
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
