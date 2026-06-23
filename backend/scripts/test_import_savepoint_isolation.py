"""
报价资料分析 — 导入事务隔离（单行失败不拖垮整批）测试脚本

覆盖范围（对应需求文档第八节）：
  1. confirm_import：3 行新询单，中间一行触发数据库写入异常（quantity 超出
     int4 范围）—— 第 1/3 行仍成功，第 2 行最终 write_failed，事务不整体回滚。
  2. confirm_import：已有询单追加 3 个新款式，中间一行写入异常 —— 成功的两行
     正确追加，失败行不影响，且只对该询单触发一次预警重扫。
  3. confirm_import_rows：同测试 1，但走"前端编辑后提交"路径。

用法：
  cd backend && python scripts/test_import_savepoint_isolation.py

会在真实数据库中写入以 TESTSP- 为前缀的测试数据，结束后自动清理。
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
from app.services.import_service import confirm_import, confirm_import_rows

GREEN = "\033[0;32m"
RED   = "\033[0;31m"
CYAN  = "\033[0;36m"
BOLD  = "\033[1m"
NC    = "\033[0m"

PREFIX = "TESTSP-"
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
        inq_no, "TSP01", "测试客户SP", "美国", "A组", "张三", "泳装",
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
        select(ImportBatch.id).where(ImportBatch.file_name.like("test_sp_%"))
    )).scalars().all()
    if batch_ids:
        await db.execute(delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))
        await db.execute(text(
            "delete from operation_logs where action_type in "
            "('warning_run_check','import_row_write_failed') "
            "and after_data_json->>'import_batch_id' = any(:ids)"
        ), {"ids": [str(b) for b in batch_ids]})
        await db.execute(delete(ImportBatch).where(ImportBatch.id.in_(batch_ids)))
    await db.execute(text("delete from customers where customer_code = 'TSP01'"))
    await db.commit()


async def test_1_mid_row_write_failure(db) -> None:
    header("测试1：confirm_import — 中间一行数据库写入异常，不拖垮整批")
    rows = [
        _row(f"{PREFIX}101", "X001", "正常款式一"),
        _row(f"{PREFIX}102", "X002", "故意写入失败款式", quantity=BAD_QUANTITY),
        _row(f"{PREFIX}103", "X003", "正常款式二"),
    ]
    file_bytes = _build_excel(rows)
    batch_id = await confirm_import(db, file_bytes, "test_sp_1.xlsx")
    await db.commit()

    inq1 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}101"))).scalars().all()
    inq2 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}102"))).scalars().all()
    inq3 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}103"))).scalars().all()
    check(len(inq1) == 1, "第 1 行成功创建 inquiries")
    check(len(inq2) == 0, "第 2 行（写入异常）未创建 inquiries（事务已通过 savepoint 回滚）")
    check(len(inq3) == 1, "第 3 行仍然成功创建 inquiries（未被第 2 行拖垮）")

    batch = await db.get(ImportBatch, batch_id)
    check(batch.new_rows == 2, f"批次 new_rows == 2（实际 {batch.new_rows}）")
    check(batch.write_failed_rows == 1, f"批次 write_failed_rows == 1（实际 {batch.write_failed_rows}）")
    check(batch.validation_failed_rows == 0, "批次 validation_failed_rows == 0")
    check(batch.status == "partial", f"批次状态为 partial（实际 {batch.status}）")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.inquiry_no == f"{PREFIX}102")
    )).scalars().all()
    check(
        len(rows_log) == 1 and rows_log[0].status == "error" and rows_log[0].error_message,
        "import_rows 中第 2 行记录了失败原因",
    )

    op_logs = (await db.execute(
        select(OperationLog).where(
            OperationLog.action_type == "import_row_write_failed",
            OperationLog.inquiry_no == f"{PREFIX}102",
        )
    )).scalars().all()
    check(len(op_logs) == 1, "operation_logs 记录了 import_row_write_failed")


async def test_2_append_mid_failure(db) -> None:
    header("测试2：追加新款式中间失败 —— 不影响其他成功行，且只重扫一次预警")
    inq_no = f"{PREFIX}201"
    inq = await crud.create_inquiry(db, {
        "inquiry_no": inq_no, "customer_code": "TSP01", "customer_short_name": "测试客户SP",
        "country": "美国", "group_name": "A组", "responsible_sales": "张三",
        "product_category": "泳装", "product_name": "男童泳裤", "series_name": "SS系列",
        "quantity": 100, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
    })
    await crud.create_inquiry_item(db, inq.id, inq_no, {
        "style_no": "A001", "quote_prepared_by": "李四", "product_name": "男童泳裤",
        "product_category": "泳装", "series_name": "SS系列", "quantity": 100,
    })
    await db.commit()

    rows = [
        _row(inq_no, "A002", "正常追加款式一"),
        _row(inq_no, "A003", "故意写入失败的追加款式", quantity=BAD_QUANTITY),
        _row(inq_no, "A004", "正常追加款式二"),
    ]
    file_bytes = _build_excel(rows)
    batch_id = await confirm_import(db, file_bytes, "test_sp_2.xlsx")
    await db.commit()

    items = (await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_no == inq_no)
    )).scalars().all()
    style_nos = sorted(it.style_no for it in items)
    check(style_nos == ["A001", "A002", "A004"], f"INQ 最终款式为 A001/A002/A004（实际 {style_nos}）")

    batch = await db.get(ImportBatch, batch_id)
    check(batch.existing_rows == 2, f"批次 existing_rows == 2（实际 {batch.existing_rows}）")
    check(batch.write_failed_rows == 1, f"批次 write_failed_rows == 1（实际 {batch.write_failed_rows}）")

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
    check(len(matched) == 1, "该批次只触发了一次预警重扫（成功追加的两行合并为同一询单，去重后只扫一次）")
    check(
        matched[0].after_data_json.get("checked_inquiry_count") == 1,
        "预警重扫只检查了这一个询单（实际 %s）" % (matched[0].after_data_json.get("checked_inquiry_count") if matched else None),
    )

    write_failed_logs = (await db.execute(
        select(OperationLog).where(
            OperationLog.action_type == "import_row_write_failed",
            OperationLog.inquiry_no == inq_no,
        )
    )).scalars().all()
    check(len(write_failed_logs) == 1, "写入失败的那一行单独记录了 import_row_write_failed")


async def test_3_confirm_rows_mid_failure(db) -> None:
    header("测试3：confirm_import_rows — 编辑后提交，中间一行写入失败")
    rows_payload = [
        {
            "row_number": 2, "inquiry_no": f"{PREFIX}301",
            "parsed_data": {
                "inquiry_no": f"{PREFIX}301", "customer_code": "TSP01", "customer_short_name": "测试客户SP",
                "country": "美国", "group_name": "A组", "responsible_sales": "张三",
                "product_category": "泳装", "product_name": "正常款式一", "series_name": "SS系列",
                "quantity": 100, "inquiry_date": "2026-01-10", "style_no": "Y001", "quote_prepared_by": "李四",
            },
        },
        {
            "row_number": 3, "inquiry_no": f"{PREFIX}302",
            "parsed_data": {
                "inquiry_no": f"{PREFIX}302", "customer_code": "TSP01", "customer_short_name": "测试客户SP",
                "country": "美国", "group_name": "A组", "responsible_sales": "张三",
                "product_category": "泳装", "product_name": "故意写入失败款式", "series_name": "SS系列",
                "quantity": BAD_QUANTITY, "inquiry_date": "2026-01-10", "style_no": "Y002", "quote_prepared_by": "李四",
            },
        },
        {
            "row_number": 4, "inquiry_no": f"{PREFIX}303",
            "parsed_data": {
                "inquiry_no": f"{PREFIX}303", "customer_code": "TSP01", "customer_short_name": "测试客户SP",
                "country": "美国", "group_name": "A组", "responsible_sales": "张三",
                "product_category": "泳装", "product_name": "正常款式二", "series_name": "SS系列",
                "quantity": 100, "inquiry_date": "2026-01-10", "style_no": "Y003", "quote_prepared_by": "李四",
            },
        },
    ]
    batch_id = await confirm_import_rows(db, "test_sp_3_rows.xlsx", rows_payload)
    await db.commit()

    inq1 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}301"))).scalars().all()
    inq2 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}302"))).scalars().all()
    inq3 = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == f"{PREFIX}303"))).scalars().all()
    check(len(inq1) == 1, "第 2 行（row_number=2）成功创建")
    check(len(inq2) == 0, "第 3 行（写入异常）未创建任何数据")
    check(len(inq3) == 1, "第 4 行仍然成功创建（confirm_import_rows 路径未被拖垮）")

    batch = await db.get(ImportBatch, batch_id)
    check(batch.new_rows == 2, f"批次 new_rows == 2（实际 {batch.new_rows}）")
    check(batch.write_failed_rows == 1, f"批次 write_failed_rows == 1（实际 {batch.write_failed_rows}）")
    check(batch.status == "partial", "批次状态为 partial（前端不会显示成全部失败）")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.inquiry_no == f"{PREFIX}302")
    )).scalars().all()
    check(len(rows_log) == 1 and bool(rows_log[0].error_message), "operation/import_rows 可追溯失败行（confirm_import_rows 未抛 500）")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup(db)
        try:
            await test_1_mid_row_write_failure(db)
            await test_2_append_mid_failure(db)
            await test_3_confirm_rows_mid_failure(db)
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
