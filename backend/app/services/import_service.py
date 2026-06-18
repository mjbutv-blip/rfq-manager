"""
询单表 Excel 导入服务

流程：
  1. excel_parser.parse_excel_file()  — 纯解析（在 services/excel_parser.py）
  2. preview_import()                 — 解析 + 查询 DB 判断 new/existing，不写库
  3. confirm_import()                 — 正式写库（调用方负责 commit）
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.schemas.import_preview import ImportPreviewResult, ParsedRowOut
from app.services.warning_service import scan_inquiry_warnings
from app.services.excel_parser import ParseResult, parse_excel_file


def _to_json_safe(d: dict[str, Any]) -> dict[str, Any]:
    """将 parsed_data / raw_data 中的 date / Decimal 转为 JSON 安全类型。"""
    out: dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


# ── 预览（不写库）────────────────────────────────────────────────────────────

async def preview_import(
    db: AsyncSession,
    file_bytes: bytes,
    file_name: str,
    preview_limit: int = 50,
    scope_user=None,
) -> ImportPreviewResult:
    """
    解析 Excel + 查询 DB 判断每行状态。
    不写任何数据库记录。
    scope_user 不为 None 时，group_leader 角色会对跨组行标记为 failed。
    """
    from app.core.permissions import check_row_group_scope

    result: ParseResult = parse_excel_file(file_bytes, file_name, scope_user=scope_user)

    new_rows = existing_rows = failed_rows = duplicate_rows = 0
    preview_rows: list[ParsedRowOut] = []

    for pr in result.rows:
        if pr.status == "duplicate":
            duplicate_rows += 1
            row_status = "duplicate"
            error_msg = pr.error_message
        elif pr.status == "failed":
            failed_rows += 1
            row_status = "failed"
            error_msg = pr.error_message
        else:
            # 权限范围检查（group_leader 跨组行）
            scope_err = None
            if scope_user is not None:
                scope_err = check_row_group_scope(
                    pr.parsed_data.get("group_name"), scope_user
                )
            if scope_err:
                failed_rows += 1
                row_status = "failed"
                error_msg = scope_err
            else:
                existing = await crud.get_inquiry_by_no(db, pr.inquiry_no)
                if existing:
                    existing_rows += 1
                    row_status = "existing"
                else:
                    new_rows += 1
                    row_status = "new"
                error_msg = pr.error_message

        if len(preview_rows) < preview_limit:
            preview_rows.append(ParsedRowOut(
                row_number=pr.row_number,
                inquiry_no=pr.inquiry_no,
                status=row_status,
                parsed_data=_to_json_safe(pr.parsed_data),
                raw_data=_to_json_safe(pr.raw_data),
                error_message=error_msg,
            ))

    return ImportPreviewResult(
        file_name=result.file_name,
        sheet_name=result.sheet_name,
        total_rows=result.total_rows,
        success_rows=new_rows + existing_rows,
        new_rows=new_rows,
        existing_rows=existing_rows,
        duplicate_rows=duplicate_rows,
        failed_rows=failed_rows,
        column_mapping=result.column_mapping,
        missing_headers=result.missing_headers,
        unmapped_headers=result.unmapped_headers,
        rows=preview_rows,
    )


# ── 确认导入（写库）──────────────────────────────────────────────────────────

async def confirm_import(
    db: AsyncSession,
    file_bytes: bytes,
    file_name: str,
    uploaded_by: str | None = None,
    scope_user=None,
) -> uuid.UUID:
    """
    正式写库：
    - 设计说明：confirm 会重新解析 file_bytes（无服务端临时状态），与 preview 独立。
      MVP 阶段合理；大文件场景可改为存 preview_id + 缓存解析结果。
    - 新询单：insert
    - 已存在或文件内重复：跳过（MVP 阶段）
    - 解析失败：记录 error 日志，不写 inquiries
    调用方负责 commit。
    返回 import_batch_id。
    """
    from app.core.permissions import check_row_group_scope

    result: ParseResult = parse_excel_file(file_bytes, file_name, scope_user=scope_user)

    batch = await crud.create_import_batch(db, {
        "file_name": file_name,
        "uploaded_by": uploaded_by,
        "total_rows": result.total_rows,
        "status": "pending",
    })
    batch_id: uuid.UUID = batch.id

    success = exists = failed = duplicate = 0
    import_row_logs: list[dict[str, Any]] = []

    for pr in result.rows:
        # 文件内重复行：记录为 duplicate，不写 inquiries
        if pr.status == "duplicate":
            duplicate += 1
            import_row_logs.append({
                "batch_id": batch_id,
                "row_number": pr.row_number,
                "inquiry_no": pr.inquiry_no,
                "status": "duplicate",
                "raw_data_json": None,
                "parsed_data_json": None,
                "error_message": pr.error_message,
            })
            continue

        # 解析失败行：记录 error
        if pr.status == "failed":
            failed += 1
            import_row_logs.append({
                "batch_id": batch_id,
                "row_number": pr.row_number,
                "inquiry_no": pr.inquiry_no,
                "status": "error",
                "raw_data_json": {k: str(v) for k, v in pr.raw_data.items()},
                "parsed_data_json": _to_json_safe(pr.parsed_data),
                "error_message": pr.error_message,
            })
            continue

        # 权限范围检查（group_leader 跨组行）
        if scope_user is not None:
            scope_err = check_row_group_scope(pr.parsed_data.get("group_name"), scope_user)
            if scope_err:
                failed += 1
                import_row_logs.append({
                    "batch_id": batch_id,
                    "row_number": pr.row_number,
                    "inquiry_no": pr.inquiry_no,
                    "status": "error",
                    "raw_data_json": {k: str(v) for k, v in pr.raw_data.items()},
                    "parsed_data_json": _to_json_safe(pr.parsed_data),
                    "error_message": scope_err,
                })
                continue

        # 有效行：查 DB 是否已存在
        existing = await crud.get_inquiry_by_no(db, pr.inquiry_no)
        if existing:
            exists += 1
            import_row_logs.append({
                "batch_id": batch_id,
                "row_number": pr.row_number,
                "inquiry_no": pr.inquiry_no,
                "status": "exists",
                "raw_data_json": None,
                "parsed_data_json": None,
                "error_message": None,
            })
            continue

        # 新增
        try:
            inq_data = {k: v for k, v in pr.parsed_data.items() if k != "factory_name"}
            inq = await crud.create_inquiry(db, {**inq_data, "import_batch_id": batch_id})
            if pr.parsed_data.get("customer_code"):
                await _sync_customer(db, pr.parsed_data)
            if pr.parsed_data.get("factory_name") and pr.parsed_data.get("factory_price"):
                await _sync_factory(db, pr.parsed_data, inq)
            success += 1
            import_row_logs.append({
                "batch_id": batch_id,
                "row_number": pr.row_number,
                "inquiry_no": pr.inquiry_no,
                "status": "new",
                "raw_data_json": None,
                "parsed_data_json": None,
                "error_message": None,
            })
        except Exception as exc:
            failed += 1
            import_row_logs.append({
                "batch_id": batch_id,
                "row_number": pr.row_number,
                "inquiry_no": pr.inquiry_no,
                "status": "error",
                "raw_data_json": None,
                "parsed_data_json": None,
                "error_message": str(exc),
            })

    # 批量写 import_rows 日志
    if import_row_logs:
        await crud.bulk_create_import_rows(db, import_row_logs)

    # processed = 新增 + 已存在（这两种都算正常处理完毕）
    processed = success + exists
    if failed == 0:
        final_status = "success"
    elif processed > 0:
        final_status = "partial"
    else:
        final_status = "failed"
    await crud.update_import_batch(db, batch_id, {
        "success_rows": success,
        "failed_rows": failed,
        "new_rows": success,
        "existing_rows": exists,
        "duplicate_rows": duplicate,
        "status": final_status,
    })

    # 对本批次新写入的询单运行预警扫描
    from sqlalchemy import select
    from app.models import Inquiry
    result = await db.execute(select(Inquiry).where(Inquiry.import_batch_id == batch_id))
    for inq in result.scalars().all():
        await scan_inquiry_warnings(db, inq)

    return batch_id


def _coerce_row_data(raw: dict[str, Any]) -> dict[str, Any]:
    """
    将前端 JSON 字段值转换为 Python 类型，过滤占位符和空值。
    日期字符串 "YYYY-MM-DD" → date；数值字符串 → int / Decimal。
    """
    import re
    from datetime import date as date_type
    from decimal import Decimal, InvalidOperation
    from app.core.field_mapping import DATE_FIELDS, DECIMAL_FIELDS, INT_FIELDS, PCT_FIELDS

    MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    PLACEHOLDER_RE = re.compile(r'^[-—\s]+$')

    result: dict[str, Any] = {}

    for key, val in raw.items():
        if val is None:
            continue
        s = str(val).strip()
        if not s or PLACEHOLDER_RE.match(s):
            continue

        try:
            if key in DATE_FIELDS:
                if isinstance(val, date_type):
                    result[key] = val
                else:
                    result[key] = date_type.fromisoformat(s)
            elif key in INT_FIELDS:
                result[key] = int(float(s))
            elif key in DECIMAL_FIELDS or key in PCT_FIELDS:
                result[key] = Decimal(s)
            else:
                result[key] = s[:2000]
        except (ValueError, InvalidOperation, TypeError):
            pass

    # 从 inquiry_date 派生 inquiry_year / inquiry_month
    if "inquiry_date" in result and isinstance(result["inquiry_date"], date_type):
        d = result["inquiry_date"]
        result.setdefault("inquiry_year", d.year)
        result.setdefault("inquiry_month", MONTH_ABBR[d.month - 1])

    return result


async def confirm_import_rows(
    db: AsyncSession,
    file_name: str,
    rows: list[dict[str, Any]],
    uploaded_by: str | None = None,
    scope_user=None,
) -> uuid.UUID:
    """
    接收前端编辑后的行数据，直接写入 DB，不重新解析 Excel。
    用于可编辑预览确认导入场景。调用方负责 commit。
    """
    from app.core.permissions import check_row_group_scope

    batch = await crud.create_import_batch(db, {
        "file_name": file_name,
        "uploaded_by": uploaded_by,
        "total_rows": len(rows),
        "status": "pending",
    })
    batch_id: uuid.UUID = batch.id

    success = exists = failed = duplicate = 0
    logs: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row_item in rows:
        row_num: int = row_item["row_number"]
        raw_parsed: dict[str, Any] = row_item["parsed_data"]

        # 优先从 parsed_data 读 inquiry_no（可能被用户编辑过）
        inquiry_no = str(
            raw_parsed.get("inquiry_no") or row_item.get("inquiry_no") or ""
        ).strip() or None

        if not inquiry_no:
            failed += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": None,
                "status": "error", "error_message": "缺少询单号",
                "raw_data_json": None, "parsed_data_json": None,
            })
            continue

        if inquiry_no in seen:
            duplicate += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
                "status": "duplicate", "error_message": f"文件内询单号重复：{inquiry_no}",
                "raw_data_json": None, "parsed_data_json": None,
            })
            continue
        seen.add(inquiry_no)

        if scope_user is not None:
            scope_err = check_row_group_scope(raw_parsed.get("group_name"), scope_user)
            if scope_err:
                failed += 1
                logs.append({
                    "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
                    "status": "error", "error_message": scope_err,
                    "raw_data_json": None, "parsed_data_json": None,
                })
                continue

        clean = _coerce_row_data(raw_parsed)

        # 业务员账号自己上传：强制写为本人；管理员/组长代传：不覆盖，
        # 只在前端没填时用上传账号本人补默认值。
        if scope_user is not None:
            uploader_name = (
                getattr(scope_user, "display_name", None) or getattr(scope_user, "username", None)
            )
            if getattr(scope_user, "role", None) == "sales":
                clean["responsible_sales"] = uploader_name
            else:
                clean.setdefault("responsible_sales", uploader_name)

        existing = await crud.get_inquiry_by_no(db, inquiry_no)
        if existing:
            exists += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
                "status": "exists", "error_message": None,
                "raw_data_json": None, "parsed_data_json": None,
            })
            continue

        try:
            inq_clean = {k: v for k, v in clean.items() if k != "factory_name"}
            inq = await crud.create_inquiry(db, {**inq_clean, "import_batch_id": batch_id})
            if clean.get("customer_code"):
                await _sync_customer(db, clean)
            if clean.get("factory_name") and clean.get("factory_price"):
                await _sync_factory(db, clean, inq)
            success += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
                "status": "new", "error_message": None,
                "raw_data_json": None, "parsed_data_json": None,
            })
        except Exception as exc:
            failed += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
                "status": "error", "error_message": str(exc),
                "raw_data_json": None, "parsed_data_json": None,
            })

    if logs:
        await crud.bulk_create_import_rows(db, logs)

    processed = success + exists
    final_status = "success" if failed == 0 else ("partial" if processed > 0 else "failed")
    await crud.update_import_batch(db, batch_id, {
        "success_rows": success, "failed_rows": failed,
        "new_rows": success, "existing_rows": exists,
        "duplicate_rows": duplicate, "status": final_status,
    })

    # 对本批次新写入的询单运行预警扫描
    from sqlalchemy import select
    from app.models import Inquiry
    result = await db.execute(select(Inquiry).where(Inquiry.import_batch_id == batch_id))
    for inq in result.scalars().all():
        await scan_inquiry_warnings(db, inq)

    return batch_id


async def _sync_customer(db: AsyncSession, parsed: dict[str, Any]) -> None:
    """从询单数据同步/创建 customer 记录（customer_code 必须存在）。"""
    await crud.upsert_customer(db, {
        "customer_code":       parsed["customer_code"],
        "customer_name":       parsed.get("customer_name"),
        "customer_short_name": parsed.get("customer_short_name"),
        "country":             parsed.get("country"),
        "region":              parsed.get("region"),
        "customer_category":   parsed.get("customer_category"),
        "group_name":          parsed.get("group_name"),
        "responsible_sales":   parsed.get("responsible_sales"),
    })


async def _sync_factory(db: AsyncSession, parsed: dict[str, Any], inquiry) -> None:
    """
    从询单数据同步/创建工厂和报价记录。
    仅在 factory_name + factory_price 都存在时调用。
    失败不影响主业务。
    """
    import uuid as _uuid
    from app.models.factory_quote_record import FactoryQuoteRecord
    from app.services.factory_service import find_or_create_factory
    try:
        factory = await find_or_create_factory(db, parsed["factory_name"])
        record = FactoryQuoteRecord(
            id=_uuid.uuid4(),
            factory_id=factory.id,
            factory_name=factory.factory_short_name or factory.factory_name,
            inquiry_id=inquiry.id,
            inquiry_no=getattr(inquiry, "inquiry_no", None),
            product_category=parsed.get("product_category"),
            product_name=parsed.get("product_name"),
            series_name=parsed.get("series_name"),
            quantity=parsed.get("order_quantity") or parsed.get("quantity"),
            factory_price=float(parsed["factory_price"]) if parsed.get("factory_price") else None,
            quote_date=parsed.get("inquiry_date"),
            order_status=parsed.get("order_status"),
            is_ordered=parsed.get("order_status") in ("下单", "已下单", "确认转单"),
            trade_amount=float(parsed["trade_amount"]) if parsed.get("trade_amount") else None,
            created_by="import",
        )
        db.add(record)
        await db.flush()
    except Exception as exc:
        import logging
        logging.getLogger("rfq").warning("_sync_factory failed: %s", exc)
