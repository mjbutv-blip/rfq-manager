"""
报价资料分析 Step 3 —— 询单款式明细编辑入口 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），
覆盖需求文档第十四节的场景 1-6（新增 / 编辑 / 工艺标签 / 尺码标签 / 权限 / 删除）。

用法：
  确保本地后端已在 8000 端口运行（uvicorn --reload）
  cd backend && python scripts/test_inquiry_style_items.py

会写入以 TESTSI- 为前缀的测试询单，结束后自动清理。
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


async def seed() -> tuple[str, str]:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)
        inq_a = await crud.create_inquiry(db, {
            "inquiry_no": "TESTSI-001", "customer_code": "TSI01", "customer_short_name": "款式明细测试客户",
            "country": "美国", "group_name": "A组", "responsible_sales": "王芳",
            "product_category": "泳装", "product_name": "男童泳裤", "series_name": "SS系列",
            "quantity": 100, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
        })
        inq_b = await crud.create_inquiry(db, {
            "inquiry_no": "TESTSI-002", "customer_code": "TSI02", "customer_short_name": "款式明细测试客户B",
            "country": "英国", "group_name": "B组", "responsible_sales": "李梅",
            "product_category": "泳装", "product_name": "女童比基尼", "series_name": "SS系列",
            "quantity": 50, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
        })
        await db.commit()
        return str(inq_a.id), str(inq_b.id)


async def _cleanup_db(db) -> None:
    inq_ids = (await db.execute(
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTSI-%"))
    )).scalars().all()
    if inq_ids:
        from app.models.inquiry_item import InquiryItem
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(text("delete from customers where customer_code in ('TSI01','TSI02')"))
    await db.commit()


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def count_op_logs(action_type: str, target_id: str) -> int:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(OperationLog).where(
                OperationLog.action_type == action_type,
                OperationLog.target_id == target_id,
            )
        )).scalars().all()
        return len(rows)


async def main() -> None:
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        inq_a_id, inq_b_id = await seed()

        # ── 场景 1：新增款式 ──────────────────────────────────────────────
        header("场景1：新增款式")
        before_inq_count = (await client.get(f"{BASE}/inquiries", params={"inquiry_no": "TESTSI-001"}, headers=h("demo_admin"))).json()["total"]

        resp = await client.post(
            f"{BASE}/inquiries/{inq_a_id}/items", headers=h("demo_admin"),
            json={"product_name": "测试款式一", "style_no": "S001", "quantity": 60},
        )
        check(resp.status_code == 201, f"新增款式返回 201（实际 {resp.status_code}）")
        item = resp.json()
        item_id = item["id"]
        check(item["product_name"] == "测试款式一" and item["style_no"] == "S001", "返回数据正确")

        list_resp = await client.get(f"{BASE}/inquiries/{inq_a_id}/items", headers=h("demo_admin"))
        check(len(list_resp.json()) == 1, "列表新增一条明细")

        after_inq_count = (await client.get(f"{BASE}/inquiries", params={"inquiry_no": "TESTSI-001"}, headers=h("demo_admin"))).json()["total"]
        check(before_inq_count == after_inq_count == 1, "未新增 inquiry 主记录")

        check(await count_op_logs("inquiry_item_create", item_id) == 1, "operation_logs 有 inquiry_item_create 记录")

        # ── 场景 2：编辑基础字段 ──────────────────────────────────────────
        header("场景2：编辑基础字段")
        resp = await client.patch(
            f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"),
            json={"style_no": "S001-NEW", "product_name": "测试款式一（改名）", "quantity": 88, "quote_prepared_by": "李四"},
        )
        check(resp.status_code == 200, f"编辑成功返回 200（实际 {resp.status_code}）")
        updated = resp.json()
        check(
            updated["style_no"] == "S001-NEW" and updated["product_name"] == "测试款式一（改名）"
            and updated["quantity"] == 88 and updated["quote_prepared_by"] == "李四",
            "字段全部正确更新",
        )
        check(await count_op_logs("inquiry_item_update", item_id) == 1, "operation_logs 有 inquiry_item_update 记录")

        # 品名不允许为空
        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"), json={"product_name": ""})
        check(resp.status_code == 422, f"品名置空返回 422（实际 {resp.status_code}）")

        # quantity 必须非负
        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"), json={"quantity": -5})
        check(resp.status_code == 422, f"负数数量返回 422（实际 {resp.status_code}）")

        # ── 场景 3：工艺标签 ──────────────────────────────────────────────
        header("场景3：工艺标签")
        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"),
                                    json={"process_description": "环保面料，UV50+，热压无缝"})
        check(resp.status_code == 200, "原始工艺说明保存成功")

        resp = await client.post(f"{BASE}/inquiry-items/{item_id}/processes", headers=h("demo_admin"),
                                   json={"process_tag": "UV50+", "is_special": False})
        check(resp.status_code == 201, "添加常规工艺标签成功")
        process_id_1 = resp.json()["id"]

        resp = await client.post(f"{BASE}/inquiry-items/{item_id}/processes", headers=h("demo_admin"),
                                   json={"process_tag": "防晒涂层", "is_special": True})
        check(resp.status_code == 201, "添加特殊工艺标签成功")
        process_id_2 = resp.json()["id"]

        resp = await client.post(f"{BASE}/inquiry-items/{item_id}/processes", headers=h("demo_admin"),
                                   json={"process_tag": "uv50+", "is_special": False})
        check(resp.status_code == 409, f"重复标签（忽略大小写）返回 409（实际 {resp.status_code}）")

        item_resp = (await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))).json()
        check(len(item_resp["processes"]) == 2, f"重复标签未新增，目前共 2 条（实际 {len(item_resp['processes'])}）")

        resp = await client.delete(f"{BASE}/inquiry-items/{item_id}/processes/{process_id_1}", headers=h("demo_admin"))
        check(resp.status_code == 204, "删除工艺标签成功")
        item_resp = (await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))).json()
        check(len(item_resp["processes"]) == 1 and item_resp["processes"][0]["id"] == process_id_2, "删除后数据库同步")

        check(await count_op_logs("inquiry_item_process_create", item_id) == 2, "operation_logs 记录 2 次添加")
        check(await count_op_logs("inquiry_item_process_delete", item_id) == 1, "operation_logs 记录 1 次删除")

        # ── 场景 4：尺码标签 ──────────────────────────────────────────────
        header("场景4：尺码标签")
        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"), json={"size_range": "S-XL"})
        check(resp.status_code == 200, "原始尺码范围保存成功")

        size_ids = []
        for code in ["S", "M", "L", "XL"]:
            resp = await client.post(f"{BASE}/inquiry-items/{item_id}/sizes", headers=h("demo_admin"),
                                       json={"size_code": code, "is_special_size": False})
            check(resp.status_code == 201, f"添加尺码 {code} 成功")
            size_ids.append(resp.json()["id"])

        resp = await client.post(f"{BASE}/inquiry-items/{item_id}/sizes", headers=h("demo_admin"),
                                   json={"size_code": "m", "is_special_size": False})
        check(resp.status_code == 409, f"重复添加 M（小写）应提示重复，返回 409（实际 {resp.status_code}）")

        resp = await client.post(f"{BASE}/inquiry-items/{item_id}/sizes", headers=h("demo_admin"),
                                   json={"size_code": "3XL", "is_special_size": True})
        check(resp.status_code == 201, "标记特殊尺码 3XL 成功")
        special_size_id = resp.json()["id"]
        check(resp.json()["is_special_size"] is True, "特殊尺码标记正确")

        resp = await client.delete(f"{BASE}/inquiry-items/{item_id}/sizes/{size_ids[0]}", headers=h("demo_admin"))
        check(resp.status_code == 204, "删除尺码 S 成功")

        item_resp = (await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))).json()
        remaining_codes = sorted(s["size_code"] for s in item_resp["sizes"])
        check(remaining_codes == ["3XL", "L", "M", "XL"], f"页面和数据库同步（实际 {remaining_codes}）")

        check(await count_op_logs("inquiry_item_size_create", item_id) == 5, "operation_logs 记录 5 次添加（含被拒绝前的成功 4+1 特殊）")
        check(await count_op_logs("inquiry_item_size_delete", item_id) == 1, "operation_logs 记录 1 次删除")

        # ── 场景 5：权限 ──────────────────────────────────────────────────
        header("场景5：权限")

        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("a_leader"), json={"remark": "A组组长编辑"})
        check(resp.status_code == 200, "A组组长可以编辑 A组询单款式")

        # B 组询单先新增一条明细供跨组测试
        resp = await client.post(f"{BASE}/inquiries/{inq_b_id}/items", headers=h("demo_admin"),
                                   json={"product_name": "B组测试款式"})
        b_item_id = resp.json()["id"]

        resp = await client.patch(f"{BASE}/inquiry-items/{b_item_id}", headers=h("a_leader"), json={"remark": "试图越权"})
        check(resp.status_code == 403, f"A组组长不能编辑 B组询单款式，返回 403（实际 {resp.status_code}）")

        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("sales_a1"), json={"remark": "sales 编辑自己负责的"})
        check(resp.status_code == 200, "sales（负责本询单）可以编辑")

        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("sales_b1"), json={"remark": "试图越权"})
        check(resp.status_code == 403, f"sales（与此询单无关）不能编辑，返回 403（实际 {resp.status_code}）")

        resp = await client.get(f"{BASE}/inquiries/{inq_a_id}/items", headers=h("viewer_a"))
        check(resp.status_code == 200, "viewer 可以查看列表")

        resp = await client.post(f"{BASE}/inquiries/{inq_a_id}/items", headers=h("viewer_a"), json={"product_name": "viewer 试图新增"})
        check(resp.status_code == 403, f"viewer 新增返回 403（实际 {resp.status_code}）")

        resp = await client.patch(f"{BASE}/inquiry-items/{item_id}", headers=h("viewer_a"), json={"remark": "viewer 试图编辑"})
        check(resp.status_code == 403, f"viewer 编辑返回 403（实际 {resp.status_code}）")

        resp = await client.delete(f"{BASE}/inquiry-items/{item_id}", headers=h("viewer_a"))
        check(resp.status_code == 403, f"viewer 删除返回 403（实际 {resp.status_code}）")

        resp = await client.get(
            f"{BASE}/inquiry-items/{item_id}",
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        check(resp.status_code == 401, f"无效凭证返回 401（实际 {resp.status_code}）")

        # ── 场景 6：删除款式 ──────────────────────────────────────────────
        header("场景6：删除款式")
        process_count_before = len((await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))).json()["processes"])
        size_count_before = len((await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))).json()["sizes"])
        check(process_count_before > 0 and size_count_before > 0, "待删除款式确实带有工艺和尺码子记录")

        resp = await client.delete(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))
        check(resp.status_code == 204, "删除成功（已二次确认场景在前端 Popconfirm 实现）")

        resp = await client.get(f"{BASE}/inquiry-items/{item_id}", headers=h("demo_admin"))
        check(resp.status_code == 404, "明细已不存在")

        async with AsyncSessionLocal() as db:
            from app.models.inquiry_item_process import InquiryItemProcess
            from app.models.inquiry_item_size import InquiryItemSize
            orphan_p = (await db.execute(select(InquiryItemProcess).where(InquiryItemProcess.inquiry_item_id == item_id))).scalars().all()
            orphan_s = (await db.execute(select(InquiryItemSize).where(InquiryItemSize.inquiry_item_id == item_id))).scalars().all()
            check(len(orphan_p) == 0 and len(orphan_s) == 0, "子表记录级联删除")

            inq_after = await db.get(Inquiry, inq_a_id)
            check(inq_after is not None, "inquiry 主记录仍存在")

        check(await count_op_logs("inquiry_item_delete", item_id) == 1, "operation_logs 记录 inquiry_item_delete")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
