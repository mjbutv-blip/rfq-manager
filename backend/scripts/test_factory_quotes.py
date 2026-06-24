"""
询单工厂价格录入（纵向报价卡片）后端测试脚本

覆盖：
  1. 同询单第1轮新增工厂A/B/C三张卡片，纵向排列（不产生新列）
  2. 同询单第2轮继续新增工厂A报价
  3. 同工厂同轮重复提交返回明确提示（409）
  4. 编辑价格和备注
  5. 删除卡片不影响询单和工厂档案
  6. 同币种同单位时正确显示本轮最低（含并列）
  7. 币种或单位不同不比较（mismatch）
  8. viewer 无法新增/编辑/删除（403）
  9. 越权 API 返回 403（sales 看不到别组询单）
  10. 操作日志正确记录
  11. 未指定工厂档案时只存 factory_name，并提示未建档案

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_factory_quotes.py
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
    inq_ids = (await db.execute(select(Inquiry.id).where(Inquiry.inquiry_no.like("FQTEST-%")))).scalars().all()
    if inq_ids:
        await db.execute(delete(FactoryQuoteRecord).where(FactoryQuoteRecord.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.execute(delete(Factory).where(Factory.factory_name == "测试有档案工厂"))
    await db.execute(text("delete from customers where customer_code in ('FQT01', 'FQT02')"))
    await db.commit()


async def seed() -> dict:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)

        inq_a = await crud.create_inquiry(db, {
            "inquiry_no": "FQTEST-A1", "customer_code": "FQT01", "customer_short_name": "FQ测试客户A",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_name": "FQTEST-A1询单", "inquiry_date": date(2026, 12, 1),
        })
        inq_b = await crud.create_inquiry(db, {
            "inquiry_no": "FQTEST-B1", "customer_code": "FQT02", "customer_short_name": "FQ测试客户B",
            "group_name": "B组", "responsible_sales": "sales_b1",
            "product_name": "FQTEST-B1询单", "inquiry_date": date(2026, 12, 1),
        })
        await db.commit()
        return {"inq_a": str(inq_a.id), "inq_b": str(inq_b.id)}


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def main() -> None:
    ids = await seed()
    inq_a, inq_b = ids["inq_a"], ids["inq_b"]

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景1：第1轮新增工厂A/B/C三张卡片 ──────────────────────────────────
        header("场景1：第1轮新增工厂A/B/C三张卡片，纵向排列")
        r1 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "工厂A", "quote_round": 1, "factory_price": 8.50,
            "remark": "初次报价",
        }, headers=h("sales_a1"))
        check(r1.status_code == 201, f"工厂A第1轮创建成功（实际 {r1.status_code}）")
        cardA1 = r1.json()
        check(cardA1["factory_price"] == 8.5, "工厂A价格正确")
        check(cardA1["has_factory_profile"] is False, "未建档案的工厂 has_factory_profile=False")

        r2 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "工厂B", "quote_round": 1, "factory_price": 8.80, "remark": "含包装",
        }, headers=h("sales_a1"))
        cardB1 = r2.json()
        check(r2.status_code == 201, f"工厂B第1轮创建成功（实际 {r2.status_code}）")

        r3 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "工厂C", "quote_round": 1, "factory_price": 8.20, "remark": "未含运费",
        }, headers=h("sales_a1"))
        cardC1 = r3.json()
        check(r3.status_code == 201, f"工厂C第1轮创建成功（实际 {r3.status_code}）")

        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        check(len(listing["items"]) == 3, f"第1轮共3张卡片，纵向排列（实际 {len(listing['items'])}）")
        check(
            [it["factory_name"] for it in listing["items"]] == ["工厂A", "工厂B", "工厂C"],
            f"同轮内按工厂名称升序排列（实际 {[it['factory_name'] for it in listing['items']]}）",
        )

        # ── 场景2：第2轮继续新增工厂A报价 ──────────────────────────────────────
        header("场景2：第2轮可继续新增工厂A报价")
        r4 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "工厂A", "factory_price": 8.30, "remark": "二次议价后",
        }, headers=h("sales_a1"))
        cardA2 = r4.json()
        check(r4.status_code == 201, f"工厂A第2轮创建成功（实际 {r4.status_code}）")
        check(cardA2["quote_round"] == 2, f"未指定轮次时默认取最大轮次+1（实际 {cardA2['quote_round']}）")

        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        check(len(listing["items"]) == 4, f"现在共4张卡片（实际 {len(listing['items'])}）")
        rounds = [it["quote_round"] for it in listing["items"]]
        check(rounds == sorted(rounds), f"卡片按轮次升序排列（实际 {rounds}）")

        # ── 场景3：同工厂同轮重复提交返回明确提示 ──────────────────────────────
        header("场景3：同工厂同轮重复提交返回明确提示")
        r5 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "工厂A", "quote_round": 1, "factory_price": 8.10,
        }, headers=h("sales_a1"))
        check(r5.status_code == 409, f"重复记录返回409（实际 {r5.status_code}）")
        check("第 1 轮" in r5.json()["detail"] and "工厂A" in r5.json()["detail"], f"提示信息明确（实际：{r5.json()['detail']}）")

        # ── 场景4：编辑价格和备注 ──────────────────────────────────────────────
        header("场景4：编辑价格和备注")
        r6 = await client.patch(f"{BASE}/factory-quotes/{cardC1['id']}", json={
            "factory_price": 8.15, "remark": "未含运费，已二次核价",
        }, headers=h("sales_a1"))
        check(r6.status_code == 200, f"编辑成功（实际 {r6.status_code}）")
        check(r6.json()["factory_price"] == 8.15, "价格已更新")
        check(r6.json()["remark"] == "未含运费，已二次核价", "备注已更新")

        # ── 场景6/7：本轮最低价比较 ─────────────────────────────────────────────
        header("场景6-7：本轮最低价比较 / 币种单位不一致不比较")
        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        by_factory_round1 = {it["factory_name"]: it for it in listing["items"] if it["quote_round"] == 1}
        check(by_factory_round1["工厂C"]["round_comparison"] == "lowest", f"工厂C（8.15）第1轮最低（实际 {by_factory_round1['工厂C']['round_comparison']}）")
        check(by_factory_round1["工厂A"]["round_comparison"] == "not_lowest", "工厂A非最低")
        check(by_factory_round1["工厂B"]["round_comparison"] == "not_lowest", "工厂B非最低")

        # 工厂B改成跟工厂C同价，验证并列最低
        await client.patch(f"{BASE}/factory-quotes/{cardB1['id']}", json={"factory_price": 8.15}, headers=h("sales_a1"))
        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        round1 = {it["factory_name"]: it for it in listing["items"] if it["quote_round"] == 1}
        check(round1["工厂B"]["round_comparison"] == "lowest" and round1["工厂C"]["round_comparison"] == "lowest",
              "价格相同时全部标记为本轮最低（并列）")

        # 工厂B币种改成CNY，验证币种不一致时不比较
        await client.patch(f"{BASE}/factory-quotes/{cardB1['id']}", json={"currency": "CNY"}, headers=h("sales_a1"))
        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        round1 = {it["factory_name"]: it for it in listing["items"] if it["quote_round"] == 1}
        check(
            round1["工厂A"]["round_comparison"] == "mismatch"
            and round1["工厂B"]["round_comparison"] == "mismatch"
            and round1["工厂C"]["round_comparison"] == "mismatch",
            f"币种不一致时整轮标记为不比较（实际 {[round1[k]['round_comparison'] for k in ('工厂A','工厂B','工厂C')]}）",
        )
        # 改回USD，恢复正常比较状态，不影响后续场景
        await client.patch(f"{BASE}/factory-quotes/{cardB1['id']}", json={"currency": "USD", "factory_price": 8.80}, headers=h("sales_a1"))

        # ── 场景5：删除卡片不影响询单和工厂档案 ─────────────────────────────────
        header("场景5：删除卡片不影响询单和工厂档案")
        inq_before = (await client.get(f"{BASE}/inquiries/{inq_a}", headers=h("sales_a1"))).json()
        r7 = await client.delete(f"{BASE}/factory-quotes/{cardA2['id']}", headers=h("sales_a1"))
        check(r7.status_code == 204, f"删除成功（实际 {r7.status_code}）")
        inq_after = (await client.get(f"{BASE}/inquiries/{inq_a}", headers=h("sales_a1"))).json()
        check(inq_before["inquiry_no"] == inq_after["inquiry_no"], "删除报价卡片后询单本身不受影响")
        listing = (await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a1"))).json()
        check(len(listing["items"]) == 3, f"删除后剩3张卡片（实际 {len(listing['items'])}）")

        # ── 场景11：已建档案的工厂关联 + has_factory_profile ────────────────────
        header("场景11：已建工厂档案时正确关联")
        r8 = await client.post(f"{BASE}/factories", json={"factory_name": "测试有档案工厂"}, headers=h("demo_admin"))
        factory_id = r8.json()["id"]
        r9 = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_id": factory_id, "factory_price": 9.0,
        }, headers=h("sales_a1"))
        check(r9.status_code == 201, f"按工厂ID创建成功（实际 {r9.status_code}）")
        check(r9.json()["has_factory_profile"] is True, "已建档案工厂 has_factory_profile=True")
        # 工厂详情页应能看到这条关联报价
        r10 = await client.get(f"{BASE}/factories/{factory_id}/quote-records", headers=h("demo_admin"))
        check(any(it["id"] == r9.json()["id"] for it in r10.json()["items"]), "工厂详情页能看到该工厂关联的报价历史")

        # ── 场景8/9：权限测试 ──────────────────────────────────────────────────
        header("场景8-9：权限测试")
        r_viewer_list = await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("viewer_a"))
        check(r_viewer_list.status_code == 200 and r_viewer_list.json()["can_edit"] is False, "viewer 可查看但 can_edit=False（前端据此隐藏操作按钮）")

        r_viewer_create = await client.post(f"{BASE}/inquiries/{inq_a}/factory-quotes", json={
            "factory_name": "viewer测试工厂", "factory_price": 1.0,
        }, headers=h("viewer_a"))
        check(r_viewer_create.status_code == 403, f"viewer 新增返回403（实际 {r_viewer_create.status_code}）")

        r_viewer_edit = await client.patch(f"{BASE}/factory-quotes/{cardC1['id']}", json={"factory_price": 1.0}, headers=h("viewer_a"))
        check(r_viewer_edit.status_code == 403, f"viewer 编辑返回403（实际 {r_viewer_edit.status_code}）")

        r_viewer_delete = await client.delete(f"{BASE}/factory-quotes/{cardC1['id']}", headers=h("viewer_a"))
        check(r_viewer_delete.status_code == 403, f"viewer 删除返回403（实际 {r_viewer_delete.status_code}）")

        # sales_a2（A组但与该询单无关）应该看不到 —— 不是本人负责/协助
        r_a2 = await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("sales_a2"))
        check(r_a2.status_code == 403, f"sales_a2 不是该询单负责人，越权返回403（实际 {r_a2.status_code}）")

        # b_leader 不能看 A组询单
        r_bleader = await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("b_leader"))
        check(r_bleader.status_code == 403, f"B组组长越权访问A组询单返回403（实际 {r_bleader.status_code}）")

        # a_leader 可以看 A组询单
        r_aleader = await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers=h("a_leader"))
        check(r_aleader.status_code == 200, f"A组组长可访问本组询单（实际 {r_aleader.status_code}）")

        # sales_b1 在自己的询单上可以新增
        r_b1 = await client.post(f"{BASE}/inquiries/{inq_b}/factory-quotes", json={
            "factory_name": "工厂D", "factory_price": 5.0,
        }, headers=h("sales_b1"))
        check(r_b1.status_code == 201, f"sales_b1 在自己负责的B组询单可新增（实际 {r_b1.status_code}）")
        card_d = r_b1.json()

        # 未登录 401（无 X-Username 但生产模式才生效，开发模式下默认 demo_admin，这里改用无效 token 模拟）
        r_401 = await client.get(f"{BASE}/inquiries/{inq_a}/factory-quotes", headers={"Authorization": "Bearer invalid-token-xyz"})
        check(r_401.status_code == 401, f"无效凭证返回401（实际 {r_401.status_code}）")

        # ── 场景10：操作日志 ──────────────────────────────────────────────────
        header("场景10：操作日志正确记录")
        logs = (await client.get(f"{BASE}/operation-logs", params={"target_id": card_d["id"]}, headers=h("demo_admin"))).json()
        create_log = next((l for l in logs["items"] if l["action_type"] == "factory_quote_create"), None)
        check(create_log is not None, "新增操作记录了 factory_quote_create 日志")
        if create_log:
            check(create_log["after_data_json"]["factory_name"] == "工厂D", "日志包含 factory_name")
            check(create_log["after_data_json"]["quote_round"] == 1, "日志包含 quote_round")
            check(create_log["after_data_json"]["factory_price"] == 5.0, "日志包含 factory_price")
            check(create_log["after_data_json"]["currency"] == "USD", "日志包含 currency")
            check(create_log["after_data_json"]["price_unit"] == "件", "日志包含 price_unit")
            check(create_log["inquiry_no"] == "FQTEST-B1", "日志包含 inquiry_no")
            check(create_log["actor_username"] == "sales_b1", "日志记录了操作人")

        await client.patch(f"{BASE}/factory-quotes/{card_d['id']}", json={"factory_price": 5.5}, headers=h("sales_b1"))
        logs = (await client.get(f"{BASE}/operation-logs", params={"target_id": card_d["id"]}, headers=h("demo_admin"))).json()
        check(any(l["action_type"] == "factory_quote_update" for l in logs["items"]), "编辑操作记录了 factory_quote_update 日志")

        await client.delete(f"{BASE}/factory-quotes/{card_d['id']}", headers=h("sales_b1"))
        logs = (await client.get(f"{BASE}/operation-logs", params={"target_id": card_d["id"]}, headers=h("demo_admin"))).json()
        check(any(l["action_type"] == "factory_quote_delete" for l in logs["items"]), "删除操作记录了 factory_quote_delete 日志")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
