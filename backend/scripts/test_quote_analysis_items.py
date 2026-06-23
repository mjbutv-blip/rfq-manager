"""
报价资料分析 — 数据层基础测试脚本

覆盖范围：
  1. migration：新字段/新表是否存在
  2. 同一询单号下多款式导入（情况 B）：1 个 inquiries + N 个 inquiry_items
  3. 重复款式明细识别（情况 C）：duplicate_item，不重复创建明细
  4. 字段保存：style_no / quote_prepared_by / process_description /
     size_range / extra_data，以及常规/特殊工艺原文是否正确拼接和归档
  5. 权限规则：admin / group_leader / sales / viewer 对 inquiry_items 的
     编辑权限（直接复用 can_edit_inquiry / can_view_inquiry，与
     routers/inquiry_items.py 使用的判断逻辑完全一致）

用法：
  cd backend && python scripts/test_quote_analysis_items.py

本脚本会在真实数据库中写入以 TESTQA- 为前缀的测试数据，结束后自动清理，
不影响其他询单号的数据。
"""

from __future__ import annotations

import asyncio
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import openpyxl
from datetime import date
from sqlalchemy import delete, select, text

from app.database import AsyncSessionLocal
from app.core.permissions import can_edit_inquiry, can_view_inquiry
from app.models import Inquiry, ImportBatch, ImportRow, User
from app.models.inquiry_item import InquiryItem
from app.services.import_service import confirm_import

GREEN  = "\033[0;32m"
RED    = "\033[0;31m"
CYAN   = "\033[0;36m"
BOLD   = "\033[1m"
NC     = "\033[0m"

PREFIX = "TESTQA-"

_failures: list[str] = []


def ok(msg: str) -> None:
    print(f"{GREEN}  ✓ {msg}{NC}")


def fail(msg: str) -> None:
    print(f"{RED}  ✗ {msg}{NC}")
    _failures.append(msg)


def header(msg: str) -> None:
    print(f"\n{CYAN}{BOLD}=== {msg} ==={NC}")


def check(condition: bool, msg: str) -> None:
    ok(msg) if condition else fail(msg)


# ── 1. Migration 检查 ───────────────────────────────────────────────────────

async def test_migration(db) -> None:
    header("1. Migration：新字段 / 新表")

    cols = (await db.execute(text(
        "select column_name from information_schema.columns where table_name='inquiry_items'"
    ))).scalars().all()
    for f in ("style_no", "quote_prepared_by", "process_description", "extra_data"):
        check(f in cols, f"inquiry_items.{f} 存在")

    tables = (await db.execute(text(
        "select table_name from information_schema.tables "
        "where table_name in ('inquiry_item_processes', 'inquiry_item_sizes')"
    ))).scalars().all()
    check("inquiry_item_processes" in tables, "inquiry_item_processes 表存在")
    check("inquiry_item_sizes" in tables, "inquiry_item_sizes 表存在")


# ── 2-4. 导入：同询单多款式 + 重复明细 + 字段保存 ────────────────────────────────

def _build_test_excel() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "询单总表"

    headers = [
        "询单号", "客户代码", "客户简称", "国家", "所属小组",
        "负责业务员", "产品大类", "品名", "系列",
        "数量", "询单日期", "订单状态", "最终报价", "毛利率", "备注",
        "款号", "报价单填报人", "常规工艺", "特殊工艺", "尺码范围", "数量单位",
    ]
    ws.append(headers)

    inq_no = f"{PREFIX}001"
    rows = [
        # 询单号, 客户代码, 客户简称, 国家, 组, 业务员, 大类, 品名, 系列, 数量, 日期, 状态, 报价, 毛利, 备注,
        # 款号, 填报人, 常规工艺, 特殊工艺, 尺码范围, 数量单位
        [inq_no, "TQA01", "测试客户A", "美国", "A组", "张三", "泳装", "男童泳裤", "SS系列",
         500, date(2026, 1, 10), "跟进中", 12.5, "18.5%", "",
         "A001", "李四", "印花", "防晒涂层", "S-XL", "件"],
        [inq_no, "TQA01", "测试客户A", "美国", "A组", "张三", "泳装", "女童比基尼", "SS系列",
         300, date(2026, 1, 10), "跟进中", 13.0, "18.0%", "",
         "A002", "李四", "印花", "", "S-L", "件"],
        [inq_no, "TQA01", "测试客户A", "美国", "A组", "张三", "泳装", "上衣", "SS系列",
         200, date(2026, 1, 10), "跟进中", 9.0, "20.0%", "",
         "A003", "王五", "绣花", "", "S-XXL", "件"],
        # 重复款式明细：同询单号 + 同款号 A001
        [inq_no, "TQA01", "测试客户A（重复款）", "美国", "A组", "张三", "泳装", "男童泳裤（重复）", "SS系列",
         500, date(2026, 1, 10), "跟进中", 12.5, "18.5%", "重复行",
         "A001", "李四", "印花", "防晒涂层", "S-XL", "件"],
    ]
    for r in rows:
        ws.append(r)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _cleanup(db) -> None:
    inq_ids = (await db.execute(
        select(Inquiry.id).where(Inquiry.inquiry_no.like(f"{PREFIX}%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    batch_ids = (await db.execute(
        select(ImportBatch.id).where(ImportBatch.file_name == "test_quote_analysis.xlsx")
    )).scalars().all()
    if batch_ids:
        await db.execute(delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))
        await db.execute(delete(ImportBatch).where(ImportBatch.id.in_(batch_ids)))
    await db.execute(text("delete from customers where customer_code = 'TQA01'"))
    await db.commit()


async def test_import_multi_style_and_duplicate(db) -> None:
    header("2-4. 导入：同询单多款式 / 重复明细识别 / 字段保存")

    await _cleanup(db)  # 防止上次运行残留

    file_bytes = _build_test_excel()
    batch_id = await confirm_import(db, file_bytes, "test_quote_analysis.xlsx")
    await db.commit()

    inq_no = f"{PREFIX}001"

    inquiries = (await db.execute(
        select(Inquiry).where(Inquiry.inquiry_no == inq_no)
    )).scalars().all()
    check(len(inquiries) == 1, f"inquiries 只创建 1 条（实际 {len(inquiries)}）")

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_no == inq_no).order_by(InquiryItem.style_no)
    )).scalars().all()
    check(len(items) == 3, f"inquiry_items 创建 3 条，重复款式被跳过（实际 {len(items)}）")

    if inquiries and items:
        inq = inquiries[0]
        check(all(it.inquiry_id == inq.id for it in items), "3 条明细均关联同一询单")

    batch = await db.get(ImportBatch, batch_id)
    check(batch is not None and batch.duplicate_rows == 1, "批次记录 duplicate_rows == 1")

    rows_logs = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "duplicate_item")
    )).scalars().all()
    check(len(rows_logs) == 1, "import_rows 中有 1 条 duplicate_item 日志")

    item_a001 = next((it for it in items if it.style_no == "A001"), None)
    check(item_a001 is not None, "款号 A001 的明细已保存")
    if item_a001:
        check(item_a001.quote_prepared_by == "李四", "quote_prepared_by 已保存")
        check(item_a001.size_range == "S-XL", "size_range 已保存")
        check(
            item_a001.process_description is not None
            and "印花" in item_a001.process_description
            and "防晒涂层" in item_a001.process_description,
            "process_description 含常规+特殊工艺原文",
        )
        check(
            item_a001.extra_data is not None
            and item_a001.extra_data.get("regular_process_text") == "印花"
            and item_a001.extra_data.get("special_process_text") == "防晒涂层"
            and item_a001.extra_data.get("quantity_unit") == "件",
            "extra_data 保存常规/特殊工艺原文 + 数量单位",
        )

    item_a003 = next((it for it in items if it.style_no == "A003"), None)
    check(item_a003 is not None and item_a003.quote_prepared_by == "王五", "款号 A003 由不同填报人保存正确")

    await _cleanup(db)
    ok("测试数据已清理")


# ── 5. 权限规则 ─────────────────────────────────────────────────────────────

def test_permissions() -> None:
    header("5. 权限规则（can_view_inquiry / can_edit_inquiry）")

    admin = User(username="t_admin", role="admin")
    leader_a = User(username="t_leader_a", role="group_leader", group_name="A组")
    leader_b = User(username="t_leader_b", role="group_leader", group_name="B组")
    sales_zhang = User(username="zhang", display_name="张三", role="sales")
    sales_other = User(username="other", display_name="其他人", role="sales")
    viewer_a = User(username="t_viewer_a", role="viewer", group_name="A组")

    inq_a = Inquiry(inquiry_no="X", group_name="A组", responsible_sales="张三", assisting_sales=None)
    inq_b = Inquiry(inquiry_no="Y", group_name="B组", responsible_sales="李四", assisting_sales="张三")

    check(can_edit_inquiry(inq_a, admin) and can_edit_inquiry(inq_b, admin), "admin 可编辑任意 inquiry")
    check(can_edit_inquiry(inq_a, leader_a), "A组组长可编辑本组 item")
    check(not can_edit_inquiry(inq_b, leader_a), "A组组长不能编辑 B组 item")
    check(can_edit_inquiry(inq_a, sales_zhang), "sales 可编辑自己负责的 item")
    check(can_edit_inquiry(inq_b, sales_zhang), "sales 可编辑自己协助的 item")
    check(not can_edit_inquiry(inq_a, sales_other), "sales 不能编辑与自己无关的 item")
    check(can_view_inquiry(inq_a, viewer_a) and not can_edit_inquiry(inq_a, viewer_a), "viewer 只读（可查看不可编辑）")
    check(not can_view_inquiry(inq_b, viewer_a), "viewer 不能查看其他组的 item")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await test_migration(db)
        await test_import_multi_style_and_duplicate(db)
    test_permissions()

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
