"""
根据品名自动推断产品大类（product_category）后端测试脚本

覆盖：纯函数推断规则 / 新增款式时自动填空 / 编辑款式时只填空白不覆盖
已有值 / 无法判断时保持为空。

用法：
  确保本地后端已在 8000 端口运行
  cd backend && python scripts/test_product_category_inference.py

会写入以 TESTPCI- 为前缀的测试询单，结束后自动清理。
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
from app.services.product_category_inference_service import infer_product_category

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
        select(Inquiry.id).where(Inquiry.inquiry_no.like("TESTPCI-%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    await db.commit()


async def cleanup() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)


async def seed() -> dict:
    async with AsyncSessionLocal() as db:
        await _cleanup_db(db)
        inq = await crud.create_inquiry(db, {
            "inquiry_no": "TESTPCI-001", "customer_code": "PCI01", "customer_short_name": "推断测试客户",
            "group_name": "A组", "responsible_sales": "sales_a1",
            "product_name": "PCI测试询单", "inquiry_date": date(2026, 11, 1),
        })
        # 已有品类"内衣"的款式，用于测试"不覆盖"
        item_existing = await crud.create_inquiry_item(db, inq.id, "TESTPCI-001", {
            "product_name": "女士固定杯文胸", "product_category": "内衣",
        })
        await db.commit()
        return {"inquiry_id": str(inq.id), "item_existing": str(item_existing.id)}


async def main() -> None:
    # ── 场景1：纯函数推断规则 ────────────────────────────────────────────────
    header("场景1：infer_product_category() 纯函数规则")
    check(infer_product_category("女士固定杯比基尼泳装上衣") == "泳衣", "成人泳类品名 → 泳衣")
    check(infer_product_category("女童不带杯比基尼套装") == "童装泳衣", "童装泳类品名 → 童装泳衣")
    check(infer_product_category("女士固定杯文胸") == "内衣", "成人内衣品名 → 内衣")
    check(infer_product_category("女童固定杯文胸") == "童装内衣", "童装内衣品名 → 童装内衣")
    check(infer_product_category("男士三角裤") == "内衣", "三角裤关键词 → 内衣")
    check(infer_product_category("婴儿防紫外线连体泳装") == "童装泳衣", "婴儿+泳类关键词 → 童装泳衣")
    check(infer_product_category("女童防紫外线上衣") is None, "无法判断的品名 → None（不强行归类）")
    check(infer_product_category("") is None, "空品名 → None")
    check(infer_product_category(None) is None, "None 品名 → None")
    check(infer_product_category("   ") is None, "全空格品名 → None")

    ids = await seed()

    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        # ── 场景2：新增款式时品类留空自动填入 ──────────────────────────────────
        header("场景2：新增款式时自动填入品类")
        resp = await client.post(
            f"{BASE}/inquiries/{ids['inquiry_id']}/items",
            json={"product_name": "女士比基尼三角裤", "product_category": None},
            headers=h("sales_a1"),
        )
        check(resp.status_code == 201, f"创建成功（实际 {resp.status_code} {resp.text}）")
        check(resp.json()["product_category"] == "泳衣", f"品类自动推断为泳衣（实际 {resp.json()['product_category']}）")
        item_swim_id = resp.json()["id"]

        resp = await client.post(
            f"{BASE}/inquiries/{ids['inquiry_id']}/items",
            json={"product_name": "女童防紫外线上衣"},
            headers=h("sales_a1"),
        )
        check(resp.status_code == 201, f"创建成功（实际 {resp.status_code}）")
        check(resp.json()["product_category"] is None, f"无法判断时新增后品类仍为空（实际 {resp.json()['product_category']}）")

        resp = await client.post(
            f"{BASE}/inquiries/{ids['inquiry_id']}/items",
            json={"product_name": "女士比基尼上衣", "product_category": "运动"},
            headers=h("sales_a1"),
        )
        check(resp.json()["product_category"] == "运动", f"显式传入品类时不被自动推断覆盖（实际 {resp.json()['product_category']}）")

        # ── 场景3：编辑款式时只填空白，不覆盖已有值 ─────────────────────────────
        header("场景3：编辑款式时只填空白，不覆盖已有值")
        resp = await client.patch(
            f"{BASE}/inquiry-items/{ids['item_existing']}",
            json={"product_name": "女士比基尼连体泳装"},
            headers=h("sales_a1"),
        )
        check(resp.status_code == 200, f"编辑成功（实际 {resp.status_code}）")
        check(resp.json()["product_category"] == "内衣", f"已有品类'内衣'不被新品名的推断结果覆盖（实际 {resp.json()['product_category']}）")

        resp = await client.patch(
            f"{BASE}/inquiry-items/{item_swim_id}",
            json={"product_category": ""},
            headers=h("sales_a1"),
        )
        check(resp.json()["product_category"] is None or resp.json()["product_category"] == "", "先清空品类")
        resp = await client.patch(
            f"{BASE}/inquiry-items/{item_swim_id}",
            json={"remark": "触发一次保存"},
            headers=h("sales_a1"),
        )
        check(resp.json()["product_category"] == "泳衣", f"品类为空时编辑（即使没碰品名）会按当前品名重新推断填入（实际 {resp.json()['product_category']}）")

        resp = await client.patch(
            f"{BASE}/inquiry-items/{ids['item_existing']}",
            json={"product_category": "泳衣"},
            headers=h("sales_a1"),
        )
        check(resp.json()["product_category"] == "泳衣", "用户显式传入品类时以用户传入值为准")

    await cleanup()
    ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
