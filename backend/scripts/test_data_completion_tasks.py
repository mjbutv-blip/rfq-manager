"""
报价资料分析 Step 10 —— 历史资料补录任务管理 后端测试脚本

通过真实 HTTP 请求驱动本地运行中的后端（http://127.0.0.1:8000），覆盖需求
文档第十二节列出的场景：从 priority item 创建任务 / 不重复创建 / 默认负责人
与优先级规则 / 四种角色权限 / 手动更新 / 完成与取消 / 自动完成（全部/部分
补齐）/ 自动完成不受非任务范围字段影响 / 空数据结构稳定。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_data_completion_tasks.py

会写入以 TESTDCT- 为前缀的测试询单，结束后自动清理。
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
from app.models.data_completion_task import DataCompletionTask
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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTDCT-%"))
    )).scalars().all()
    if inq_ids:
        item_ids = (await db.execute(
            select(InquiryItem.id).where(InquiryItem.inquiry_id.in_(inq_ids))
        )).scalars().all()
        if item_ids:
            await db.execute(delete(DataCompletionTask).where(DataCompletionTask.inquiry_item_id.in_(item_ids)))
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
    A组（sales_a1 负责，ABC客户）：
      itemA1 同时缺款号/工艺/尺码/填报人（combo），非已下单/已报价 → 默认优先级 high（组合规则）
      itemA2 已下单，只缺数量 → 默认优先级 high（已下单规则）
      itemA3 未下单未报价，只缺数量 → 默认优先级 medium
      itemA4 quote_prepared_by="sales_a1"，只缺数量 → 默认负责人 sales_a1
      itemA5 quote_prepared_by 为空，responsible_sales="sales_a1"，只缺数量 → 默认负责人退化为 sales_a1
      itemA6 quote_prepared_by="viewer_a"（只读账号），只缺数量 → 不自动指派（None）
      itemA7 已下单+已报价，分配给 a_leader，用于测试 sales 不能动别人任务
      itemA8 用于自动完成测试：style_no+quantity 缺失，process/size/填报人齐全

    B组（sales_b1，权限隔离用）：
      itemF1 缺数量
    """
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        async def make_inq(no, cust_code, cust_name, group, sales, cat, order_status, quote_status):
            return await crud.create_inquiry(db, {
                "inquiry_no": no, "customer_code": cust_code, "customer_short_name": cust_name,
                "group_name": group, "responsible_sales": sales,
                "product_category": cat, "product_name": f"{no}询单",
                "inquiry_date": date(2026, 10, 1), "order_status": order_status, "quote_status": quote_status,
            })

        inqA1 = await make_inq("TESTDCT-A1", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA1 = await crud.create_inquiry_item(db, inqA1.id, "TESTDCT-A1", {
            "product_name": "组合缺失款式", "product_category": "泳装", "quantity": 100,
        })

        inqA2 = await make_inq("TESTDCT-A2", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "下单", "未报价")
        itemA2 = await crud.create_inquiry_item(db, inqA2.id, "TESTDCT-A2", {
            "style_no": "A002", "product_name": "已下单缺数量", "product_category": "泳装",
            "quote_prepared_by": "张三", "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA3 = await make_inq("TESTDCT-A3", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA3 = await crud.create_inquiry_item(db, inqA3.id, "TESTDCT-A3", {
            "style_no": "A003", "product_name": "普通缺数量", "product_category": "泳装",
            "quote_prepared_by": "张三", "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA4 = await make_inq("TESTDCT-A4", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA4 = await crud.create_inquiry_item(db, inqA4.id, "TESTDCT-A4", {
            "style_no": "A004", "product_name": "填报人是sales_a1", "product_category": "泳装",
            "quote_prepared_by": "sales_a1", "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA5 = await make_inq("TESTDCT-A5", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA5 = await crud.create_inquiry_item(db, inqA5.id, "TESTDCT-A5", {
            "style_no": "A005", "product_name": "填报人为空退化负责人", "product_category": "泳装",
            "quote_prepared_by": "", "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA6 = await make_inq("TESTDCT-A6", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA6 = await crud.create_inquiry_item(db, inqA6.id, "TESTDCT-A6", {
            "style_no": "A006", "product_name": "填报人是viewer", "product_category": "泳装",
            "quote_prepared_by": "viewer_a", "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA7 = await make_inq("TESTDCT-A7", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "下单", "已报价")
        itemA7 = await crud.create_inquiry_item(db, inqA7.id, "TESTDCT-A7", {
            "style_no": "A007", "product_name": "分配给a_leader", "product_category": "泳装",
            "process_description": "UV50+", "size_range": "S-XL",
        })

        inqA8 = await make_inq("TESTDCT-A8", "CCT01", "ABC客户", "A组", "sales_a1", "泳装", "跟进中", "未报价")
        itemA8 = await crud.create_inquiry_item(db, inqA8.id, "TESTDCT-A8", {
            "product_name": "自动完成测试款式", "product_category": "泳装",
            "quote_prepared_by": "张三", "process_description": "UV50+", "size_range": "S-XL",
        })
        db.add(InquiryItemProcess(inquiry_item_id=itemA8.id, process_tag="UV50+", is_special=False))

        inqF1 = await make_inq("TESTDCT-F1", "CCT03", "DEF客户", "B组", "sales_b1", "泳装", "跟进中", "未报价")
        itemF1 = await crud.create_inquiry_item(db, inqF1.id, "TESTDCT-F1", {
            "style_no": "F001", "product_name": "B组款式", "product_category": "泳装",
            "quote_prepared_by": "赵六", "process_description": "防水", "size_range": "M",
        })

        await db.commit()
        return {
            "itemA1": str(itemA1.id), "itemA2": str(itemA2.id), "itemA3": str(itemA3.id),
            "itemA4": str(itemA4.id), "itemA5": str(itemA5.id), "itemA6": str(itemA6.id),
            "itemA7": str(itemA7.id), "itemA8": str(itemA8.id), "itemF1": str(itemF1.id),
        }


async def main() -> None:
    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        async def create_task(item_id: str, username: str, **body_extra) -> httpx.Response:
            body = {"source_module": "quote-data-quality", **body_extra}
            return await client.post(
                f"{BASE}/inquiry-items/{item_id}/data-completion-task", json=body, headers=h(username),
            )

        # ── 场景1：从 priority item 创建任务 + 默认优先级规则 ─────────────────
        header("场景1：从 priority item 创建任务 + 默认优先级规则")
        resp = await create_task(ids["itemA1"], "sales_a1")
        check(resp.status_code == 201, f"itemA1 创建任务返回 201（实际 {resp.status_code} {resp.text}）")
        dataA1 = resp.json()
        check(dataA1["created"] is True, "itemA1 首次创建 created=True")
        check(dataA1["task"]["priority"] == "high", f"itemA1 组合缺失（款号+工艺+尺码+填报人）默认优先级 high（实际 {dataA1['task']['priority']}）")
        check(set(dataA1["task"]["missing_fields_json"]) == {"款号", "原始工艺说明/标准化工艺标签", "原始尺码范围/标准化尺码", "报价单填报人"},
              f"itemA1 missing_fields 正确（实际 {dataA1['task']['missing_fields_json']}）")
        taskA1_id = dataA1["task"]["id"]

        resp = await create_task(ids["itemA2"], "sales_a1")
        dataA2 = resp.json()
        check(dataA2["task"]["priority"] == "high", f"itemA2 已下单缺数量 默认优先级 high（实际 {dataA2['task']['priority']}）")
        check(dataA2["task"]["missing_fields_json"] == ["数量"], f"itemA2 missing_fields 正确（实际 {dataA2['task']['missing_fields_json']}）")

        resp = await create_task(ids["itemA3"], "sales_a1")
        dataA3 = resp.json()
        check(dataA3["task"]["priority"] == "medium", f"itemA3 普通缺数量 默认优先级 medium（实际 {dataA3['task']['priority']}）")
        taskA3_id = dataA3["task"]["id"]

        # ── 场景2：同一 item 不重复创建未关闭任务 ─────────────────────────────
        header("场景2：同一 item 不重复创建未关闭任务")
        resp2 = await create_task(ids["itemA1"], "sales_a1")
        dataA1_again = resp2.json()
        check(resp2.status_code == 201, "重复创建请求仍返回 201（语义上是幂等获取，不是报错）")
        check(dataA1_again["created"] is False, "第二次创建 created=False（复用已有任务）")
        check(dataA1_again["task"]["id"] == taskA1_id, "复用的是同一条任务记录")

        # ── 场景3：默认负责人选择逻辑 ──────────────────────────────────────────
        header("场景3：默认负责人选择逻辑")
        resp = await create_task(ids["itemA4"], "sales_a1")
        taskA4 = resp.json()["task"]
        taskA4_id = taskA4["id"]
        check(taskA4["assigned_to"] == "sales_a1", f"itemA4 quote_prepared_by 优先生效（实际 {taskA4['assigned_to']}）")

        resp = await create_task(ids["itemA5"], "sales_a1")
        check(resp.json()["task"]["assigned_to"] == "sales_a1", f"itemA5 填报人为空退化用 responsible_sales（实际 {resp.json()['task']['assigned_to']}）")

        resp = await create_task(ids["itemA6"], "sales_a1")
        check(resp.json()["task"]["assigned_to"] is None, f"itemA6 填报人是 viewer 账号时不自动指派（实际 {resp.json()['task']['assigned_to']}）")

        resp = await create_task(ids["itemA7"], "a_leader", assigned_to="a_leader")
        taskA7 = resp.json()["task"]
        check(taskA7["assigned_to"] == "a_leader", "itemA7 显式指定负责人生效")
        taskA7_id = taskA7["id"]

        # ── 场景11：空数据返回结构稳定 ─────────────────────────────────────────
        header("场景11：空数据时结构稳定")
        resp = await client.get(f"{BASE}/data-completion-tasks", params={"status": "completed", "assigned_to": "不存在的人"}, headers=h("demo_admin"))
        check(resp.status_code == 200, f"空筛选结果仍返回 200（实际 {resp.status_code}）")
        check(resp.json() == {"items": [], "total": 0}, f"空数据结构稳定（实际 {resp.json()}）")

        # ── 场景5：权限测试 ──────────────────────────────────────────────────
        header("场景5：admin / group_leader / sales / viewer 权限")
        resp = await client.get(f"{BASE}/data-completion-tasks", params={"customer_code": "CCT01"}, headers=h("demo_admin"))
        check(resp.json()["total"] >= 7, f"admin 可见 ABC 客户全部任务（实际 {resp.json()['total']}）")

        resp = await client.get(f"{BASE}/data-completion-tasks", params={"customer_code": "CCT03"}, headers=h("a_leader"))
        check(resp.json()["total"] == 0, f"A组组长看不到 B组任务（实际 {resp.json()['total']}）")

        resp = await create_task(ids["itemF1"], "sales_b1")
        taskF1_id = resp.json()["task"]["id"]
        resp = await client.get(f"{BASE}/data-completion-tasks", params={"customer_code": "CCT03"}, headers=h("b_leader"))
        check(resp.json()["total"] == 1, f"B组组长可见本组任务（实际 {resp.json()['total']}）")

        resp = await client.get(f"{BASE}/data-completion-tasks", params={"customer_code": "CCT01"}, headers=h("sales_a2"))
        check(resp.json()["total"] == 0, f"sales_a2（与 ABC 无关）看不到任务（实际 {resp.json()['total']}）")

        # viewer 只读：可查看，不能创建/编辑/完成/取消
        resp = await client.get(f"{BASE}/data-completion-tasks", params={"customer_code": "CCT01"}, headers=h("viewer_a"))
        check(resp.status_code == 200 and resp.json()["total"] >= 7, f"viewer 可查看本组任务（实际 {resp.json()['total']}）")
        resp = await create_task(ids["itemA3"], "viewer_a")
        check(resp.status_code == 403, f"viewer 不能创建任务（实际 {resp.status_code}）")
        resp = await client.patch(f"{BASE}/data-completion-tasks/{taskA3_id}", json={"remark": "test"}, headers=h("viewer_a"))
        check(resp.status_code == 403, f"viewer 不能编辑任务（实际 {resp.status_code}）")
        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA3_id}/complete", json={}, headers=h("viewer_a"))
        check(resp.status_code == 403, f"viewer 不能完成任务（实际 {resp.status_code}）")
        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA3_id}/cancel", json={}, headers=h("viewer_a"))
        check(resp.status_code == 403, f"viewer 不能取消任务（实际 {resp.status_code}）")

        # group_leader 不能把任务分配给其他组用户
        resp = await client.patch(f"{BASE}/data-completion-tasks/{taskA3_id}", json={"assigned_to": "sales_b1"}, headers=h("a_leader"))
        check(resp.status_code == 403, f"A组组长不能把任务分配给 B组成员（实际 {resp.status_code}）")

        # sales 不能重新分配任务负责人
        resp = await client.patch(f"{BASE}/data-completion-tasks/{taskA3_id}", json={"assigned_to": "张三"}, headers=h("sales_a1"))
        check(resp.status_code == 403, f"业务员不能重新分配任务负责人（实际 {resp.status_code}）")

        # sales 不能动分配给别人的任务（taskA7 分配给 a_leader）
        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA7_id}/complete", json={}, headers=h("sales_a1"))
        check(resp.status_code == 403, f"sales_a1 不能完成分配给 a_leader 的任务（实际 {resp.status_code}）")

        # ── 场景6：手动更新负责人、优先级、备注 ────────────────────────────────
        header("场景6：手动更新优先级、备注")
        resp = await client.patch(f"{BASE}/data-completion-tasks/{taskA4_id}", json={"priority": "low", "remark": "已沟通客户，下周补充"}, headers=h("sales_a1"))
        check(resp.status_code == 200, f"sales_a1 可更新分配给自己的任务（实际 {resp.status_code} {resp.text}）")
        check(resp.json()["priority"] == "low" and resp.json()["remark"] == "已沟通客户，下周补充", "优先级和备注更新生效")

        resp = await client.patch(f"{BASE}/data-completion-tasks/{taskA7_id}", json={"assigned_to": "sales_a1"}, headers=h("a_leader"))
        check(resp.status_code == 200, f"A组组长可把任务重新分配给本组成员（实际 {resp.status_code}）")
        check(resp.json()["assigned_to"] == "sales_a1", "重新分配生效")

        # ── 场景7：完成、取消任务 ────────────────────────────────────────────
        header("场景7：完成、取消任务")
        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA7_id}/complete", json={"remark": "已补全"}, headers=h("sales_a1"))
        check(resp.status_code == 200, f"重新分配给自己后 sales_a1 可完成任务（实际 {resp.status_code}）")
        check(resp.json()["status"] == "completed" and resp.json()["completed_by"] == "sales_a1", "完成任务字段正确")
        check(resp.json()["closed_reason"] == "人工标记完成", f"closed_reason 正确（实际 {resp.json()['closed_reason']}）")

        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA7_id}/complete", json={}, headers=h("sales_a1"))
        check(resp.status_code == 400, f"已完成的任务不能再次完成（实际 {resp.status_code}）")

        resp = await create_task(ids["itemA6"], "sales_a1")
        taskA6_id = resp.json()["task"]["id"]
        resp = await client.post(f"{BASE}/data-completion-tasks/{taskA6_id}/cancel", json={"reason": "客户已确认无需补充"}, headers=h("sales_a1"))
        check(resp.status_code == 200 and resp.json()["status"] == "cancelled", f"取消任务成功（实际 {resp.json()}）")
        check(resp.json()["closed_reason"] == "客户已确认无需补充", "取消原因正确写入")

        # 已取消的旧任务不影响重新创建
        resp = await create_task(ids["itemA6"], "sales_a1")
        check(resp.json()["created"] is True, "旧任务取消后可以为同一款式重新创建任务")

        # ── 场景8/9/10：自动完成规则 ─────────────────────────────────────────
        header("场景8-10：自动完成规则（全部补齐 / 部分补齐 / 不受任务外字段影响）")
        resp = await create_task(ids["itemA8"], "sales_a1")
        taskA8 = resp.json()["task"]
        taskA8_id = taskA8["id"]
        check(set(taskA8["missing_fields_json"]) == {"款号", "数量"}, f"itemA8 任务目标字段是 款号+数量（实际 {taskA8['missing_fields_json']}）")

        # 引入一个"任务范围之外"的新缺失：删除工艺标签（itemA8 原本工艺齐全，任务目标不含工艺）
        async with AsyncSessionLocal() as db:
            item8 = await db.get(InquiryItem, ids["itemA8"])
            proc = (await db.execute(select(InquiryItemProcess).where(InquiryItemProcess.inquiry_item_id == item8.id))).scalars().first()
            proc_id = str(proc.id)
        resp = await client.delete(f"{BASE}/inquiry-items/{ids['itemA8']}/processes/{proc_id}", headers=h("sales_a1"))
        check(resp.status_code == 204, f"删除工艺标签成功（实际 {resp.status_code}）")

        resp = await client.get(f"{BASE}/data-completion-tasks/{taskA8_id}", headers=h("sales_a1"))
        check(resp.json()["status"] == "open", "删除任务范围外的工艺标签后任务仍是 open（不受影响）")
        check(set(resp.json()["missing_fields_json"]) == {"款号", "数量"}, "任务目标字段没有因为款式新增了缺工艺而被污染")

        # 只补齐一个目标字段（数量）——任务应保持未关闭，missing_fields_json 只剩 款号
        resp = await client.patch(f"{BASE}/inquiry-items/{ids['itemA8']}", json={"quantity": 88}, headers=h("sales_a1"))
        check(resp.status_code == 200, f"补齐数量成功（实际 {resp.status_code}）")
        resp = await client.get(f"{BASE}/data-completion-tasks/{taskA8_id}", headers=h("sales_a1"))
        check(resp.json()["status"] == "open", f"只补齐一个目标字段时任务仍未关闭（实际 {resp.json()['status']}）")
        check(resp.json()["missing_fields_json"] == ["款号"], f"missing_fields_json 只保留仍缺失的款号（实际 {resp.json()['missing_fields_json']}）")

        # 补齐最后一个目标字段（款号）——即使工艺仍然缺失（任务范围外），任务也应自动完成
        resp = await client.patch(f"{BASE}/inquiry-items/{ids['itemA8']}", json={"style_no": "A008"}, headers=h("sales_a1"))
        check(resp.status_code == 200, f"补齐款号成功（实际 {resp.status_code}）")
        resp = await client.get(f"{BASE}/data-completion-tasks/{taskA8_id}", headers=h("sales_a1"))
        task8_final = resp.json()
        check(task8_final["status"] == "completed", f"目标字段全部补齐后任务自动完成（实际 {task8_final['status']}）")
        check(task8_final["completed_by"] == "system", f"自动完成的 completed_by 是 system（实际 {task8_final['completed_by']}）")
        check(task8_final["closed_reason"] == "自动完成：相关缺失字段已补齐", f"closed_reason 正确（实际 {task8_final['closed_reason']}）")
        check(task8_final["missing_fields_json"] == [], "自动完成后 missing_fields_json 清空")

        # 已完成的任务不会因为款式再被改回缺失状态而自动重新打开
        resp = await client.patch(f"{BASE}/inquiry-items/{ids['itemA8']}", json={"style_no": None}, headers=h("sales_a1"))
        resp = await client.get(f"{BASE}/data-completion-tasks/{taskA8_id}", headers=h("sales_a1"))
        check(resp.json()["status"] == "completed", "已完成的任务不会自动重新打开")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
