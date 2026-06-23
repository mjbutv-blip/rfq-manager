"""
报价资料分析 — "写入失败的款式键不能被提前占用"测试脚本

覆盖范围（对应本轮需求文档第五节）：
  1. 第一条同款式行写入失败，第二条同款式行应能正常重试成功（不能被误判 duplicate_item）；
  2. 第一条成功，第二条同款应正常判定为 duplicate_item（确保没有破坏原有逻辑）；
  3. 已有询单追加款式：第一条写入失败，第二条同款仍能成功追加，且预警重扫
     只对最终成功的状态执行一次。

用法：
  cd backend && python scripts/test_import_key_reservation.py

会在真实数据库中写入以 TESTKR- 为前缀的测试数据，结束后自动清理。
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
from app import crud
from app.models import ImportBatch, ImportRow, Inquiry, OperationLog, InquiryWarning
from app.models.inquiry_item import InquiryItem
from app.services.import_service import confirm_import

GREEN = "\033[0;32m"
RED   = "\033[0;31m"
CYAN  = "\033[0;36m"
BOLD  = "\033[1m"
NC    = "\033[0m"

PREFIX = "TESTKR-"
BAD_QUANTITY = 9_999_999_999  # 超出 PostgreSQL integer (int4) 范围，触发真实 DataError
_failures: list[str] = []


def ok(msg: str) -> None: print(f"{GREEN}  ✓ {msg}{NC}")
def fail(msg: str) -> None:
    print(f"{RED}  ✗ {msg}{NC}")
    _failures.append(msg)
def header(msg: str) -> None: print(f"\n{CYAN}{BOLD}=== {msg} ==={NC}")
def check(condition: bool, msg: str) -> None:
    ok(msg) if condition else fail(msg)


HEADERS = [
    "询单号", "客户代码", "客户简称", "国家", "所属小组",
    "负责业务员", "产品大类", "品名", "系列",
    "数量", "询单日期", "订单状态", "最终报价", "毛利率", "备注",
    "款号", "报价单填报人",
]


def _build_excel(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "询单总表"
    ws.append(HEADERS)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row(inq_no, style_no, product_name, quantity=100, series_name="SS系列"):
    return [
        inq_no, "TKR01", "测试客户KR", "美国", "A组", "张三", "泳装",
        product_name, series_name, quantity, date(2026, 1, 10), "跟进中",
        10.0, "20%", "", style_no, "李四",
    ]


async def _cleanup(db) -> None:
    inq_ids = (await db.execute(
        select(Inquiry.id).where(Inquiry.inquiry_no.like(f"{PREFIX}%"))
    )).scalars().all()
    if inq_ids:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    batch_ids = (await db.execute(
        select(ImportBatch.id).where(ImportBatch.file_name.like("test_kr_%"))
    )).scalars().all()
    if batch_ids:
        await db.execute(delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))
        await db.execute(text(
            "delete from operation_logs where action_type in "
            "('warning_run_check','import_row_write_failed','inquiry_item_import_skip_duplicate') "
            "and after_data_json->>'import_batch_id' = any(:ids)"
        ), {"ids": [str(b) for b in batch_ids]})
        await db.execute(delete(ImportBatch).where(ImportBatch.id.in_(batch_ids)))
    await db.execute(text("delete from customers where customer_code = 'TKR01'"))
    await db.commit()


async def test_1_retry_after_failure(db) -> None:
    header("测试1：第一条同款式写入失败，第二条同款式应能正常重试成功")
    inq_no = f"{PREFIX}101"
    rows = [
        _row(inq_no, "A001", "故意写入失败款式", quantity=BAD_QUANTITY),
        _row(inq_no, "A001", "正常数据，应能重试成功"),
    ]
    file_bytes = _build_excel(rows)
    batch_id = await confirm_import(db, file_bytes, "test_kr_1.xlsx")
    await db.commit()

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_no == inq_no)
    )).scalars().all()
    check(len(items) == 1, f"数据库最终只有 1 条 A001（实际 {len(items)}）")
    if items:
        check(items[0].product_name == "正常数据，应能重试成功", "成功写入的是第 2 行的数据（而不是第 1 行失败的脏数据）")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id).order_by(ImportRow.row_number)
    )).scalars().all()
    check(len(rows_log) == 2, "import_rows 记录了 2 行")
    check(rows_log[0].status == "error", f"第 1 行最终是 write_failed（实际 {rows_log[0].status}）")
    check(rows_log[1].status == "new", f"第 2 行最终成功（实际 {rows_log[1].status}）")
    check(
        not any(r.status == "duplicate_item" for r in rows_log),
        "不出现错误的 duplicate_item",
    )

    batch = await db.get(ImportBatch, batch_id)
    check(batch.write_failed_rows == 1, f"write_failed_rows == 1（实际 {batch.write_failed_rows}）")
    check(
        batch.new_rows + batch.existing_rows == 1,
        f"total_success_rows == 1（实际 {batch.new_rows + batch.existing_rows}）",
    )


async def test_2_normal_duplicate_still_skipped(db) -> None:
    header("测试2：第一条成功，第二条同款应正常判定为 duplicate_item（回归）")
    inq_no = f"{PREFIX}102"
    rows = [
        _row(inq_no, "A001", "正常第一条"),
        _row(inq_no, "A001", "正常第二条（应判重）"),
    ]
    file_bytes = _build_excel(rows)
    batch_id = await confirm_import(db, file_bytes, "test_kr_2.xlsx")
    await db.commit()

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_no == inq_no)
    )).scalars().all()
    check(len(items) == 1, f"数据库只有 1 条 A001（实际 {len(items)}）")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id).order_by(ImportRow.row_number)
    )).scalars().all()
    check(rows_log[0].status == "new", f"第 1 行成功（实际 {rows_log[0].status}）")
    check(rows_log[1].status == "duplicate_item", f"第 2 行判定为 duplicate_item（实际 {rows_log[1].status}）")

    batch = await db.get(ImportBatch, batch_id)
    check(batch.new_rows == 1, f"new_rows == 1（实际 {batch.new_rows}）")
    check(batch.duplicate_rows == 1, f"duplicate_rows == 1（实际 {batch.duplicate_rows}）")


async def test_3_append_retry_after_failure(db) -> None:
    header("测试3：已有询单追加款式，第一条失败后第二条同款仍能成功追加")
    inq_no = f"{PREFIX}103"
    inq = await crud.create_inquiry(db, {
        "inquiry_no": inq_no, "customer_code": "TKR01", "customer_short_name": "测试客户KR",
        "country": "美国", "group_name": "A组", "responsible_sales": "张三",
        "product_category": "泳装", "product_name": "男童泳裤", "series_name": "SS系列",
        "quantity": 100, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
    })
    await crud.create_inquiry_item(db, inq.id, inq_no, {
        "style_no": "A000", "quote_prepared_by": "李四", "product_name": "男童泳裤",
        "product_category": "泳装", "series_name": "SS系列", "quantity": 100,
    })
    await db.commit()

    rows = [
        _row(inq_no, "A002", "追加款式，第一次写入故意失败", quantity=BAD_QUANTITY),
        _row(inq_no, "A002", "追加款式，第二次应成功"),
    ]
    file_bytes = _build_excel(rows)
    batch_id = await confirm_import(db, file_bytes, "test_kr_3.xlsx")
    await db.commit()

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_no == inq_no)
    )).scalars().all()
    style_nos = sorted(it.style_no for it in items)
    check(style_nos == ["A000", "A002"], f"第 2 行可以成功追加，不会被误判为重复（实际 {style_nos}）")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id).order_by(ImportRow.row_number)
    )).scalars().all()
    check(rows_log[0].status == "error", f"第 1 行 write_failed（实际 {rows_log[0].status}）")
    check(
        rows_log[1].status == "existing_inquiry_new_item",
        f"第 2 行 existing_inquiry_new_item（实际 {rows_log[1].status}）——不能因第 1 行失败被误判为 duplicate_item",
    )

    warning_logs = (await db.execute(
        select(OperationLog).where(
            OperationLog.action_type == "warning_run_check",
            OperationLog.description == "导入追加款式后重新运行预警检查",
        )
    )).scalars().all()
    matched = [
        l for l in warning_logs
        if (l.after_data_json or {}).get("import_batch_id") == str(batch_id)
    ]
    check(len(matched) == 1, "预警重扫只对最终成功追加的 INQ 执行了一次")
    check(
        matched[0].after_data_json.get("checked_inquiry_count") == 1,
        "预警重扫只检查了这一个询单",
    )


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup(db)
        try:
            await test_1_retry_after_failure(db)
            await test_2_normal_duplicate_still_skipped(db)
            await test_3_append_retry_after_failure(db)
        finally:
            await _cleanup(db)
            ok("测试数据已清理")

    print()
    if _failures:
        fail(f"共 {len(_failures)} 项校验失败")
        sys.exit(1)
    print(f"{GREEN}{BOLD}所有校验通过 ✓{NC}")


if __name__ == "__main__":
    asyncio.run(main())
