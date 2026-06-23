"""
报价资料分析 — "已存在询单追加新款式"测试脚本

覆盖范围（对应需求文档第十一节）：
  1. 已有询单追加新款式 -> existing_inquiry_new_item
  2. 已有询单重复款式 -> duplicate_item
  3. 已有询单但无法判断款式 -> existing_inquiry_item_uncertain
  4. 新询单多款式 -> new（全部 importable，回归测试）
  5. 权限：group_leader 不能向其他组的已有询单追加款式

用法：
  cd backend && python scripts/test_existing_inquiry_append.py

会在真实数据库中写入以 TESTAP- 为前缀的测试数据，结束后自动清理。
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
from app.models import ImportBatch, ImportRow, Inquiry, OperationLog, User
from app.models.inquiry_item import InquiryItem
from app.services.import_service import confirm_import, confirm_import_rows, preview_import

GREEN = "\033[0;32m"
RED   = "\033[0;31m"
CYAN  = "\033[0;36m"
BOLD  = "\033[1m"
NC    = "\033[0m"

PREFIX = "TESTAP-"
_failures: list[str] = []


def ok(msg: str) -> None: print(f"{GREEN}  ✓ {msg}{NC}")
def fail(msg: str) -> None:
    print(f"{RED}  ✗ {msg}{NC}")
    _failures.append(msg)
def header(msg: str) -> None: print(f"\n{CYAN}{BOLD}=== {msg} ==={NC}")
def check(condition: bool, msg: str) -> None:
    ok(msg) if condition else fail(msg)


def _build_excel(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "询单总表"
    headers = [
        "询单号", "客户代码", "客户简称", "国家", "所属小组",
        "负责业务员", "产品大类", "品名", "系列",
        "数量", "询单日期", "订单状态", "最终报价", "毛利率", "备注",
        "款号", "报价单填报人",
    ]
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row(inq_no, group, style_no, product_name, series_name="SS系列"):
    return [
        inq_no, "TAP01", "测试客户AP", "美国", group, "张三", "泳装",
        product_name, series_name, 100, date(2026, 1, 10), "跟进中", 10.0, "20%", "",
        style_no, "李四",
    ]


async def _cleanup(db) -> None:
    inq_ids = (await db.execute(
        select(Inquiry.id).where(Inquiry.inquiry_no.like(f"{PREFIX}%"))
    )).scalars().all()
    if inq_ids:
        from app.models import InquiryWarning
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id.in_(inq_ids)))
        await db.execute(delete(OperationLog).where(OperationLog.inquiry_id.in_(inq_ids)))
        await db.execute(delete(InquiryWarning).where(InquiryWarning.inquiry_id.in_(inq_ids)))
        await db.execute(delete(Inquiry).where(Inquiry.id.in_(inq_ids)))
    batch_ids = (await db.execute(
        select(ImportBatch.id).where(ImportBatch.file_name.like("test_append_%"))
    )).scalars().all()
    if batch_ids:
        await db.execute(delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))
        await db.execute(text(
            "delete from operation_logs where action_type = 'warning_run_check' "
            "and after_data_json->>'import_batch_id' = any(:ids)"
        ), {"ids": [str(b) for b in batch_ids]})
        await db.execute(delete(ImportBatch).where(ImportBatch.id.in_(batch_ids)))
    await db.execute(text("delete from customers where customer_code = 'TAP01'"))
    await db.commit()


async def _seed_inquiry_with_item(db, inq_no: str, group: str, style_no: str, product_name: str) -> Inquiry:
    inq = await db.get(Inquiry, None) if False else None  # noop, keep linter happy
    from app import crud
    inq = await crud.create_inquiry(db, {
        "inquiry_no": inq_no, "customer_code": "TAP01", "customer_short_name": "测试客户AP",
        "country": "美国", "group_name": group, "responsible_sales": "张三",
        "product_category": "泳装", "product_name": product_name, "series_name": "SS系列",
        "quantity": 100, "inquiry_date": date(2026, 1, 10), "order_status": "跟进中",
    })
    await crud.create_inquiry_item(db, inq.id, inq_no, {
        "style_no": style_no, "quote_prepared_by": "李四",
        "product_name": product_name, "product_category": "泳装", "series_name": "SS系列",
        "quantity": 100,
    })
    await db.commit()
    return inq


async def test_1_append_new_style(db) -> None:
    header("测试1：已有询单追加新款式 -> existing_inquiry_new_item")
    inq_no = f"{PREFIX}001"
    await _seed_inquiry_with_item(db, inq_no, "A组", "A001", "男童泳裤")

    file_bytes = _build_excel([_row(inq_no, "A组", "A002", "女童比基尼")])
    preview = await preview_import(db, file_bytes, "test_append_1.xlsx")
    check(len(preview.rows) == 1 and preview.rows[0].status == "existing_inquiry_new_item",
          "preview 状态为 existing_inquiry_new_item")
    check(preview.importable_rows == 1, "importable_rows 增加为 1")

    inquiries_before = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inq_no))).scalars().all()
    batch_id = await confirm_import(db, file_bytes, "test_append_1.xlsx")
    await db.commit()

    inquiries_after = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inq_no))).scalars().all()
    check(len(inquiries_after) == len(inquiries_before) == 1, "inquiries 数量不增加")

    items = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items) == 2, f"inquiry_items 数量增加到 2（实际 {len(items)}）")
    a002 = next((it for it in items if it.style_no == "A002"), None)
    check(a002 is not None and a002.inquiry_id == inquiries_after[0].id, "A002 正确关联到该询单")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "existing_inquiry_new_item")
    )).scalars().all()
    check(len(rows_log) == 1, "import_rows 记录 1 条 existing_inquiry_new_item")

    op_logs = (await db.execute(
        select(OperationLog).where(OperationLog.action_type == "inquiry_item_import_append",
                                     OperationLog.inquiry_no == inq_no)
    )).scalars().all()
    check(len(op_logs) == 1, "operation_logs 记录 1 条 inquiry_item_import_append")


async def test_2_duplicate_existing_item(db) -> None:
    header("测试2：已有询单重复款式 -> duplicate_item")
    inq_no = f"{PREFIX}002"
    await _seed_inquiry_with_item(db, inq_no, "A组", "A001", "男童泳裤")

    file_bytes = _build_excel([_row(inq_no, "A组", "A001", "男童泳裤")])
    preview = await preview_import(db, file_bytes, "test_append_2.xlsx")
    check(preview.rows[0].status == "duplicate_item", "preview 状态为 duplicate_item")
    check(preview.importable_rows == 0, "不可自动导入（importable_rows == 0）")

    items_before = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    batch_id = await confirm_import(db, file_bytes, "test_append_2.xlsx")
    await db.commit()
    items_after = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items_after) == len(items_before) == 1, "inquiry_items 数量不增加")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "duplicate_item")
    )).scalars().all()
    check(len(rows_log) == 1 and rows_log[0].error_message == "该询单下已存在相同款式明细", "import_rows 标记 skipped 且原因正确")

    op_logs = (await db.execute(
        select(OperationLog).where(OperationLog.action_type == "inquiry_item_import_skip_duplicate",
                                     OperationLog.inquiry_no == inq_no)
    )).scalars().all()
    check(len(op_logs) == 1, "operation_logs 有跳过重复记录")


async def test_3_uncertain_existing_item(db) -> None:
    header("测试3：已有询单但无法判断款式 -> existing_inquiry_item_uncertain")
    inq_no = f"{PREFIX}003"
    await _seed_inquiry_with_item(db, inq_no, "A组", "A001", "男童泳裤")

    # 该行没有款号、没有品名、没有系列
    row = [inq_no, "TAP01", "测试客户AP", "美国", "A组", "张三", "泳装",
           "", "", 50, date(2026, 1, 10), "跟进中", 10.0, "20%", "", "", "李四"]
    file_bytes = _build_excel([row])
    preview = await preview_import(db, file_bytes, "test_append_3.xlsx")
    check(preview.rows[0].status == "existing_inquiry_item_uncertain", "preview 状态为 existing_inquiry_item_uncertain")
    check(preview.importable_rows == 0, "不可自动导入")

    items_before = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    batch_id = await confirm_import(db, file_bytes, "test_append_3.xlsx")
    await db.commit()
    items_after = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items_after) == len(items_before) == 1, "确认导入后数据不增加")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "existing_inquiry_item_uncertain")
    )).scalars().all()
    check(len(rows_log) == 1 and "无法可靠识别" in (rows_log[0].error_message or ""), "import_rows 提示明确（无法可靠识别是否为新款）")

    op_logs = (await db.execute(
        select(OperationLog).where(OperationLog.action_type == "inquiry_item_import_skip_uncertain",
                                     OperationLog.inquiry_no == inq_no)
    )).scalars().all()
    check(len(op_logs) == 1, "operation_logs 正确记录")


async def test_4_new_multi_style(db) -> None:
    header("测试4：新询单多款式 -> new（回归测试）")
    inq_no = f"{PREFIX}004"
    rows = [
        _row(inq_no, "A组", "B001", "Bra"),
        _row(inq_no, "A组", "B002", "Brief"),
        _row(inq_no, "A组", "B003", "Top"),
    ]
    file_bytes = _build_excel(rows)
    preview = await preview_import(db, file_bytes, "test_append_4.xlsx")
    check(all(r.status == "new" for r in preview.rows), "全部为 new")
    check(preview.importable_rows == 3, "全部 importable")

    await confirm_import(db, file_bytes, "test_append_4.xlsx")
    await db.commit()

    inquiries = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inq_no))).scalars().all()
    check(len(inquiries) == 1, "只创建 1 条 inquiries")
    items = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items) == 3, "创建 3 条 inquiry_items")
    check(all(it.inquiry_id == inquiries[0].id for it in items), "三条都正确关联")


async def test_5_permission_cross_group(db) -> None:
    header("测试5：权限 -> group_leader 不能向其他组已有询单追加款式")
    inq_no = f"{PREFIX}005"
    await _seed_inquiry_with_item(db, inq_no, "B组", "C001", "男童泳裤")  # 询单属于 B组

    leader_a = User(username="t_leader_a_append", role="group_leader", group_name="A组")

    file_bytes = _build_excel([_row(inq_no, "B组", "C002", "女童比基尼")])
    preview = await preview_import(db, file_bytes, "test_append_5.xlsx", scope_user=leader_a)
    check(preview.rows[0].status == "failed", "A组组长预览该行为 failed（无权限）")
    check("无权限" in (preview.rows[0].error_message or ""), "错误信息提示无权限")

    items_before = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    await confirm_import(db, file_bytes, "test_append_5.xlsx", scope_user=leader_a)
    await db.commit()
    items_after = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items_after) == len(items_before) == 1, "确认导入后未追加任何明细")


async def test_6_new_missing_product_name_rejected(db) -> None:
    header("测试6：新询单缺少品名 -> failed，不能导入")
    inq_no = f"{PREFIX}006"

    row = [inq_no, "TAP01", "测试客户AP", "美国", "A组", "张三", "泳装",
           "", "SS系列", 50, date(2026, 1, 10), "跟进中", 10.0, "20%", "", "D001", "李四"]
    file_bytes = _build_excel([row])
    preview = await preview_import(db, file_bytes, "test_append_6.xlsx")
    check(preview.rows[0].status == "failed", "preview 状态为 failed（新询单缺品名）")
    check("品名" in (preview.rows[0].error_message or ""), "错误信息提示缺少品名")
    check(preview.importable_rows == 0, "不可导入")

    batch_id = await confirm_import(db, file_bytes, "test_append_6.xlsx")
    await db.commit()
    inquiries = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inq_no))).scalars().all()
    check(len(inquiries) == 0, "确认导入后未创建 inquiries")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "error")
    )).scalars().all()
    check(len(rows_log) == 1 and "品名" in (rows_log[0].error_message or ""), "import_rows 记录品名缺失错误")


async def test_7_append_via_product_series_key(db) -> None:
    header("测试7：style_no 为空但 product_name+series_name 完整 -> 仍可追加新款")
    inq_no = f"{PREFIX}007"
    await _seed_inquiry_with_item(db, inq_no, "A组", "E001", "男童泳裤")

    # 新行没有款号，但品名+系列与已有款式都不同 -> 应判定为新款可追加
    row = [inq_no, "TAP01", "测试客户AP", "美国", "A组", "张三", "泳装",
           "女童连体泳衣", "SS系列", 40, date(2026, 1, 10), "跟进中", 10.0, "20%", "", "", "李四"]
    file_bytes = _build_excel([row])
    preview = await preview_import(db, file_bytes, "test_append_7.xlsx")
    check(preview.rows[0].status == "existing_inquiry_new_item",
          "preview 状态为 existing_inquiry_new_item（依据 product_name+series_name 识别）")
    check(preview.importable_rows == 1, "可导入")

    items_before = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    await confirm_import(db, file_bytes, "test_append_7.xlsx")
    await db.commit()
    items_after = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items_after) == len(items_before) + 1, "inquiry_items 数量增加 1")
    new_item = next((it for it in items_after if it.product_name == "女童连体泳衣"), None)
    check(new_item is not None and not new_item.style_no, "新款式正确写入（无款号）")


async def test_8_warning_rescan_after_append(db) -> None:
    header("测试8：追加款式后触发该询单的预警重新扫描")
    from app.models import InquiryWarning

    inq_no = f"{PREFIX}008"
    inq = await _seed_inquiry_with_item(db, inq_no, "A组", "F001", "男童泳裤")

    # 手动种一条"已修复"的陈旧未处理预警，验证 run_check_for_inquiries 会清理它
    stale = InquiryWarning(
        inquiry_id=inq.id, inquiry_no=inq_no,
        warning_type="missing_required_field", warning_level="medium",
        warning_message="陈旧的虚构预警（应被增量扫描清理）",
        field_name="__not_a_real_field__", is_resolved=False,
    )
    db.add(stale)
    await db.commit()

    file_bytes = _build_excel([_row(inq_no, "A组", "F002", "女童比基尼")])
    batch_id = await confirm_import(db, file_bytes, "test_append_8.xlsx")
    await db.commit()

    op_logs = (await db.execute(
        select(OperationLog).where(
            OperationLog.action_type == "warning_run_check",
            OperationLog.description == "导入追加款式后重新运行预警检查",
        )
    )).scalars().all()
    check(len(op_logs) >= 1, "operation_logs 记录了 warning_run_check")
    matched = [
        l for l in op_logs
        if (l.after_data_json or {}).get("import_batch_id") == str(batch_id)
    ]
    check(len(matched) == 1, "该批次对应的 warning_run_check 日志可追溯到 batch_id")

    remaining_stale = (await db.execute(
        select(InquiryWarning).where(
            InquiryWarning.inquiry_id == inq.id,
            InquiryWarning.field_name == "__not_a_real_field__",
        )
    )).scalars().all()
    check(len(remaining_stale) == 0, "陈旧的虚构预警已被增量扫描清理（未重复保留）")


async def test_9_confirm_import_rows_with_date(db) -> None:
    header("测试9：confirm_import_rows 处理含 inquiry_date 的行（回归：inquiry_year 类型转换）")
    inq_no = f"{PREFIX}009"

    # 模拟前端预览后编辑提交的 payload：parsed_data 来自 preview 的 JSON
    # （inquiry_year/inquiry_month 已由解析器算出，随 JSON 往返）。
    file_bytes = _build_excel([_row(inq_no, "A组", "G001", "Bra")])
    preview = await preview_import(db, file_bytes, "test_append_9.xlsx")
    check(preview.rows[0].status == "new", "preview 状态为 new")

    row_payload = {
        "row_number": preview.rows[0].row_number,
        "inquiry_no": inq_no,
        "parsed_data": {**preview.rows[0].parsed_data, "inquiry_year": "2026", "inquiry_month": "Jan"},
    }
    batch_id = await confirm_import_rows(db, "test_append_9_rows.xlsx", [row_payload])
    await db.commit()

    inquiries = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inq_no))).scalars().all()
    check(len(inquiries) == 1, "confirm_import_rows 成功创建 inquiries（未因 inquiry_year 类型报错）")
    items = (await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no == inq_no))).scalars().all()
    check(len(items) == 1, "confirm_import_rows 成功创建 inquiry_items")

    rows_log = (await db.execute(
        select(ImportRow).where(ImportRow.batch_id == batch_id, ImportRow.status == "new")
    )).scalars().all()
    check(len(rows_log) == 1, "import_rows 记录 new")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await _cleanup(db)
        try:
            await test_1_append_new_style(db)
            await test_2_duplicate_existing_item(db)
            await test_3_uncertain_existing_item(db)
            await test_4_new_multi_style(db)
            await test_5_permission_cross_group(db)
            await test_6_new_missing_product_name_rejected(db)
            await test_7_append_via_product_series_key(db)
            await test_8_warning_rescan_after_append(db)
            await test_9_confirm_import_rows_with_date(db)
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
