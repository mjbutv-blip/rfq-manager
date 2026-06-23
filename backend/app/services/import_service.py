"""
询单表 Excel 导入服务

流程：
  1. excel_parser.parse_excel_file()  — 纯解析（在 services/excel_parser.py）
  2. preview_import()                 — 解析 + 查询 DB 判断 new/existing，不写库
  3. confirm_import()                 — 正式写库（调用方负责 commit）
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.schemas.import_preview import ImportPreviewResult, ParsedRowOut
from app.services.operation_log_service import log_kwargs_from_user, safe_log
from app.services.warning_service import scan_inquiry_warnings
from app.services.excel_parser import ParseResult, build_item_identity_key, parse_excel_file


def _resolve_override_sales(override_sales: str | None, scope_user: Any) -> str | None:
    """
    只有 admin / group_leader 可以手动指定归属业务员；
    sales 账号自己上传时始终归本人，忽略该参数（防止冒充他人）。
    """
    if not override_sales or scope_user is None:
        return None
    if getattr(scope_user, "role", None) not in ("admin", "group_leader"):
        return None
    return override_sales


def _split_item_fields(parsed: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    把一行解析结果拆分为 (询单级字段 dict, 款式级字段 dict)。
    询单级字段写入 inquiries；款式级字段写入对应的 inquiry_items 行。
    数量字段不拆分新字段，直接复用同一个 quantity 值（询单级与款式级一致）。
    常规/特殊工艺原文拼接进 process_description，同时各自原文存入 extra_data，
    避免拼接后丢失"是否特殊"的信息；数量单位等暂无独立列的字段也存入 extra_data。
    """
    from app.core.field_mapping import (
        ITEM_LEVEL_FIELDS,
        QUANTITY_UNIT_TEMP_FIELD,
        REGULAR_PROCESS_TEXT_FIELD,
        SPECIAL_PROCESS_TEXT_FIELD,
    )

    inq: dict[str, Any] = dict(parsed)
    item: dict[str, Any] = {}
    extra: dict[str, Any] = {}

    regular_text = inq.pop(REGULAR_PROCESS_TEXT_FIELD, None)
    special_text = inq.pop(SPECIAL_PROCESS_TEXT_FIELD, None)
    quantity_unit_text = inq.pop(QUANTITY_UNIT_TEMP_FIELD, None)

    for field_name in ITEM_LEVEL_FIELDS:
        if field_name in inq:
            item[field_name] = inq.pop(field_name)

    if regular_text or special_text:
        parts = []
        if item.get("process_description"):
            parts.append(item["process_description"])
        if regular_text:
            parts.append(f"常规工艺：{regular_text}")
            extra["regular_process_text"] = regular_text
        if special_text:
            parts.append(f"特殊工艺：{special_text}")
            extra["special_process_text"] = special_text
        item["process_description"] = "；".join(parts)

    if quantity_unit_text:
        extra["quantity_unit"] = quantity_unit_text

    if extra:
        item["extra_data"] = extra

    # 款式级冗余字段：复用同一行的产品信息和数量，不新增 quote_quantity
    for fallback_field in ("product_name", "product_category", "series_name", "quantity"):
        if fallback_field in inq:
            item[fallback_field] = inq[fallback_field]

    return inq, item


_INQUIRY_FILLABLE_FIELDS = (
    "customer_order_no", "customer_name", "customer_short_name",
    "country", "region", "customer_category",
)


async def _fill_missing_inquiry_fields(db: AsyncSession, inquiry: Any, parsed_data: dict[str, Any]) -> None:
    """
    向已有询单追加新款式时，允许补充询单的客户基础信息缺口，
    但绝不覆盖已有的非空值——只填缺口，不做任何字段的"清空"或"改写"。
    """
    updates: dict[str, Any] = {}
    for f in _INQUIRY_FILLABLE_FIELDS:
        cur = getattr(inquiry, f, None)
        new = parsed_data.get(f)
        if (cur is None or cur == "") and new:
            updates[f] = new
    if updates:
        await crud.update_inquiry(db, inquiry.id, updates)


@dataclass
class _BatchState:
    """
    一次 preview/confirm 调用期间的 DB 查询缓存，避免对同一询单号重复查库。

    persisted_item_keys 是"真正已经存在"的款式身份键集合：
      - 已有询单：首次访问该 inquiry_no 时，从数据库现有 inquiry_items 中加载；
      - 新询单（文件内首次出现该 inquiry_no）：初始为空集合；
      - 无论新旧询单，只有当某一行真正成功写入数据库后，调用方才会把它的
        identity key 加进这个集合（见 _write_valid_row）——绝不在"分类"
        这一步就提前占用，否则一行写库失败会导致后面同款的正确行被
        误判为 duplicate_item（见本轮修复的边界 bug）。

    预览（preview_import）没有真实写库动作，因此预览只是"假设这一行分类
    成功后就会被消费"的乐观模拟，在分类后立即调用 reserve() ——这只是
    给用户看的风险提示，不代表数据库里真的有这条记录，最终是否存在以
    确认导入阶段的实际写入结果为准。
    """
    inquiry_cache: dict[str, Any] = field(default_factory=dict)        # inquiry_no -> Inquiry | None
    persisted_item_keys: dict[str, set] = field(default_factory=dict)  # inquiry_no -> {identity_key, ...}

    def reserve(self, inquiry_no: str, key: tuple | None) -> None:
        """把一个 identity key 标记为"已存在"。调用方必须确保这是真实发生的
        （已成功写库，或者是预览阶段的乐观模拟），而不是仅仅完成了分类。"""
        if key is not None:
            self.persisted_item_keys.setdefault(inquiry_no, set()).add(key)


async def _get_cached_inquiry(db: AsyncSession, inquiry_no: str, state: _BatchState) -> Any | None:
    if inquiry_no not in state.inquiry_cache:
        state.inquiry_cache[inquiry_no] = await crud.get_inquiry_by_no(db, inquiry_no)
    return state.inquiry_cache[inquiry_no]


async def _classify_existing(
    db: AsyncSession, parsed_data: dict[str, Any], state: _BatchState,
) -> tuple[str, Any | None, tuple | None]:
    """
    对已通过本地校验的一行做"款式身份"层面分类（只读，不修改 state）：

      new                              — 询单号不存在，可新建询单 + 第一条款式
      existing_inquiry_new_item        — 询单已存在，当前款式未出现过，可追加 inquiry_items
      duplicate_item                   — 当前款式身份键已经"真正存在"（已写库的同批次行，
                                          或数据库里已有的旧款式），无论该询单是新是旧
      existing_inquiry_item_uncertain  — 询单已存在，但缺少款号/完整款式信息，无法判断新旧

    返回 (status, existing_inquiry_or_None, identity_key_or_None)。
    identity_key 在 new/existing_inquiry_new_item 时非空，供调用方在真正
    写入成功后调用 state.reserve(inquiry_no, key) ——本函数本身绝不修改
    state.persisted_item_keys，避免"分类即占用"的提前锁定问题。

    同一询单号在同一批次内重复出现时复用缓存；新询单号（文件内首次出现）
    的 persisted_item_keys 初始为空集合，使得"文件内同 key 多行"和
    "数据库内已有同 key 旧款"走同一套判断逻辑。
    """
    inquiry_no = str(parsed_data.get("inquiry_no") or "").strip()
    existing_inquiry = await _get_cached_inquiry(db, inquiry_no, state)
    key = build_item_identity_key(parsed_data)

    if inquiry_no not in state.persisted_item_keys:
        if existing_inquiry is not None:
            items = await crud.list_inquiry_items(db, existing_inquiry.id)
            keys = {
                build_item_identity_key({
                    "inquiry_no": it.inquiry_no, "style_no": it.style_no,
                    "product_name": it.product_name, "series_name": it.series_name,
                })
                for it in items
            }
            keys.discard(None)
        else:
            keys = set()
        state.persisted_item_keys[inquiry_no] = keys

    if existing_inquiry is None:
        if key is not None and key in state.persisted_item_keys[inquiry_no]:
            return "duplicate_item", None, key
        return "new", None, key

    if key is None:
        return "existing_inquiry_item_uncertain", existing_inquiry, None

    if key in state.persisted_item_keys[inquiry_no]:
        return "duplicate_item", existing_inquiry, key

    return "existing_inquiry_new_item", existing_inquiry, key


def _new_inquiry_missing_field(parsed_data: dict[str, Any]) -> str | None:
    """
    新询单场景下 product_name 仍是必填的（与"已有询单追加款式"场景区分——
    后者允许 product_name 缺失，缺失到无法识别款式时归类为
    existing_inquiry_item_uncertain，而不是直接 failed）。
    """
    if not parsed_data.get("product_name"):
        return "缺少必填字段：品名"
    return None


# 预览阶段展示给用户的提示（更详细，便于人工判断下一步操作）
_SKIP_REASON = {
    "duplicate_item": "该询单下已存在相同款式明细",
    "existing_inquiry_item_uncertain": "询单已存在，但缺少款号或完整款式信息，无法自动判断是否为新款，请人工确认",
}

# 确认导入阶段写入 import_rows.error_message 的提示（与需求文档第六节措辞一致）
_CONFIRM_SKIP_REASON = {
    "duplicate_item": "该询单下已存在相同款式明细",
    "existing_inquiry_item_uncertain": "询单已存在，但无法可靠识别是否为新款，已跳过",
}


def _summarize_exception(exc: Exception) -> str:
    """异常摘要：截断超长的 SQLAlchemy/asyncpg 错误信息，避免日志/响应体过大。"""
    msg = str(exc).strip().replace("\n", " ")
    return f"{type(exc).__name__}: {msg[:300]}"


async def _write_valid_row(
    db: AsyncSession,
    *,
    batch_id: uuid.UUID,
    row_number: int,
    inquiry_no: str,
    parsed_data: dict[str, Any],
    state: _BatchState,
    created_inquiries: dict[str, Any],
    scope_user: Any,
    file_name: str,
) -> tuple[str, str | None, uuid.UUID | None]:
    """
    对一行"本地校验通过、且不是文件内重复"的数据做 DB 层面分类并执行写入。
    返回 (final_status, error_message, appended_inquiry_id)。

    final_status ∈ {"new", "existing_inquiry_new_item", "duplicate_item",
                     "existing_inquiry_item_uncertain",
                     "validation_failed", "write_failed"}

    - validation_failed：写库之前就能判断不可导入（权限/必填字段缺失），
      不涉及任何数据库写入。
    - write_failed：分类结果原本是 new / existing_inquiry_new_item（可导入），
      但实际写库时数据库抛出异常（类型错误、唯一约束冲突、外键错误等）。
      实际写入操作被包裹在 SAVEPOINT（db.begin_nested()）中，异常只回滚
      这一行自己的改动，不影响同一批次中其他行已经成功写入或将要写入的数据。

    appended_inquiry_id 仅在 final_status == "existing_inquiry_new_item" 时非空，
    供调用方收集后在批次结束后统一重新扫描这些询单的预警。
    """
    from app.core.permissions import check_row_group_scope

    # 权限范围检查：已有询单按询单本身的归属组判断；全新询单按 Excel 行的 group_name 判断。
    # 这一步只读不写，不需要 savepoint。
    if scope_user is not None:
        existing_peek = await _get_cached_inquiry(db, inquiry_no, state)
        scope_target_group = existing_peek.group_name if existing_peek else parsed_data.get("group_name")
        scope_err = check_row_group_scope(scope_target_group, scope_user)
        if scope_err:
            return "validation_failed", scope_err, None

    status, existing_inquiry, identity_key = await _classify_existing(db, parsed_data, state)
    if status == "new":
        missing_err = _new_inquiry_missing_field(parsed_data)
        if missing_err:
            return "validation_failed", missing_err, None

    log_kwargs = log_kwargs_from_user(scope_user) if scope_user is not None else {"actor_username": "system"}
    log_after_data = {
        "identity_key": str(identity_key) if identity_key else None,
        "style_no": parsed_data.get("style_no"),
        "product_name": parsed_data.get("product_name"),
        "series_name": parsed_data.get("series_name"),
        "file_name": file_name,
        "import_batch_id": str(batch_id),
    }

    if status in ("duplicate_item", "existing_inquiry_item_uncertain"):
        action_type = (
            "inquiry_item_import_skip_duplicate" if status == "duplicate_item"
            else "inquiry_item_import_skip_uncertain"
        )
        description = "跳过重复款式明细" if status == "duplicate_item" else "跳过无法确认的已有询单款式"
        await safe_log(
            **log_kwargs,
            action_type=action_type,
            target_type="inquiry_item",
            inquiry_id=getattr(existing_inquiry, "id", None),
            inquiry_no=inquiry_no,
            description=description,
            after_data={**log_after_data, "final_status": status},
        )
        return status, _CONFIRM_SKIP_REASON[status], None

    if status == "existing_inquiry_new_item":
        try:
            async with db.begin_nested():
                _, item_data = _split_item_fields(parsed_data)
                item = await crud.create_inquiry_item(db, existing_inquiry.id, inquiry_no, item_data)
                await _fill_missing_inquiry_fields(db, existing_inquiry, parsed_data)
        except Exception as exc:
            await _log_write_failure(
                log_kwargs, log_after_data, batch_id, row_number, inquiry_no,
                attempted_status=status, exc=exc,
            )
            return "write_failed", _summarize_exception(exc), None

        # 只有写库真正成功后，这个款式身份键才算"已存在"——绝不提前占用。
        state.reserve(inquiry_no, identity_key)
        await safe_log(
            **log_kwargs,
            action_type="inquiry_item_import_append",
            target_type="inquiry_item",
            target_id=str(item.id),
            inquiry_id=existing_inquiry.id,
            inquiry_no=inquiry_no,
            description="为已有询单追加款式明细",
            after_data={**log_after_data, "final_status": "existing_inquiry_new_item"},
        )
        return "existing_inquiry_new_item", None, existing_inquiry.id

    # status == "new"
    is_case_b = inquiry_no in created_inquiries
    new_inq: Any = None
    try:
        async with db.begin_nested():
            if is_case_b:
                _, item_data = _split_item_fields(parsed_data)
                await crud.create_inquiry_item(db, created_inquiries[inquiry_no].id, inquiry_no, item_data)
            else:
                inq_data, item_data = _split_item_fields(parsed_data)
                inq_data = {k: v for k, v in inq_data.items() if k != "factory_name"}
                new_inq = await crud.create_inquiry(db, {**inq_data, "import_batch_id": batch_id})
                await crud.create_inquiry_item(db, new_inq.id, inquiry_no, item_data)
                if parsed_data.get("customer_code"):
                    await _sync_customer(db, parsed_data)
                if parsed_data.get("factory_name") and parsed_data.get("factory_price"):
                    await _sync_factory(db, parsed_data, new_inq)
    except Exception as exc:
        # new_inq 若已在 savepoint 内创建，连同本行的其它改动一并被自动
        # ROLLBACK TO SAVEPOINT 撤销；不把它写进 created_inquiries，
        # 避免后续同询单号的行误以为该询单已经存在。
        await _log_write_failure(
            log_kwargs, log_after_data, batch_id, row_number, inquiry_no,
            attempted_status="new", exc=exc,
        )
        return "write_failed", _summarize_exception(exc), None

    # 只有写库真正成功后，这个款式身份键才算"已存在"——绝不提前占用，
    # 否则前一行写库失败会导致后面同款的正确行被误判为 duplicate_item。
    state.reserve(inquiry_no, identity_key)
    if new_inq is not None:
        created_inquiries[inquiry_no] = new_inq
    return "new", None, None


async def _log_write_failure(
    log_kwargs: dict[str, Any],
    log_after_data: dict[str, Any],
    batch_id: uuid.UUID,
    row_number: int,
    inquiry_no: str,
    *,
    attempted_status: str,
    exc: Exception,
) -> None:
    """
    记录"原本可导入、但实际写库失败"的行。使用独立会话的 safe_log，
    永不抛异常，即使日志写入本身失败也只打印后端日志，不影响后续行继续处理。
    """
    await safe_log(
        **log_kwargs,
        action_type="import_row_write_failed",
        target_type="import_batch",
        inquiry_no=inquiry_no,
        description="导入行写入失败",
        after_data={
            **log_after_data,
            "row_number": row_number,
            "attempted_status": attempted_status,
            "final_status": "write_failed",
            "exception_type": type(exc).__name__,
            "error_summary": _summarize_exception(exc),
        },
        status="failed",
        error_message=_summarize_exception(exc),
    )


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
    override_sales: str | None = None,
) -> ImportPreviewResult:
    """
    解析 Excel + 查询 DB 判断每行状态。
    不写任何数据库记录。
    scope_user 不为 None 时，group_leader 角色会对跨组行标记为 failed。
    override_sales：admin/group_leader 手动指定归属业务员时，覆盖 Excel/文件名/默认值。
    """
    from app.core.permissions import check_row_group_scope

    result: ParseResult = parse_excel_file(
        file_bytes, file_name, scope_user=scope_user,
        override_sales=_resolve_override_sales(override_sales, scope_user),
    )

    counts = {
        "new": 0, "existing_inquiry_new_item": 0,
        "duplicate_item": 0, "existing_inquiry_item_uncertain": 0, "failed": 0,
    }
    preview_rows: list[ParsedRowOut] = []
    state = _BatchState()

    for pr in result.rows:
        if pr.status == "failed":
            counts["failed"] += 1
            row_status = "failed"
            error_msg = pr.error_message
        else:
            # 权限范围检查：已有询单按询单本身的归属组判断；全新询单按 Excel 行的 group_name 判断。
            # 在分类之前先做权限判断，避免对将被拒绝的行也"消费"掉款式去重键。
            scope_err = None
            if scope_user is not None:
                existing_peek = await _get_cached_inquiry(db, pr.inquiry_no, state)
                scope_target_group = (
                    existing_peek.group_name if existing_peek is not None
                    else pr.parsed_data.get("group_name")
                )
                scope_err = check_row_group_scope(scope_target_group, scope_user)

            if scope_err:
                counts["failed"] += 1
                row_status = "failed"
                error_msg = scope_err
            else:
                status, _existing_inquiry, key = await _classify_existing(db, pr.parsed_data, state)
                missing_err = _new_inquiry_missing_field(pr.parsed_data) if status == "new" else None
                if missing_err:
                    counts["failed"] += 1
                    row_status = "failed"
                    error_msg = missing_err
                else:
                    # 预览没有真实写库动作：分类后立即"乐观"标记为已占用，
                    # 仅用于提示"文件内可能存在重复"，不代表数据库真的有这条记录。
                    if status in ("new", "existing_inquiry_new_item"):
                        state.reserve(pr.inquiry_no, key)
                    counts[status] += 1
                    row_status = status
                    error_msg = _SKIP_REASON.get(status, pr.error_message)

        if len(preview_rows) < preview_limit:
            preview_rows.append(ParsedRowOut(
                row_number=pr.row_number,
                inquiry_no=pr.inquiry_no,
                status=row_status,
                parsed_data=_to_json_safe(pr.parsed_data),
                raw_data=_to_json_safe(pr.raw_data),
                error_message=error_msg,
            ))

    importable_rows = counts["new"] + counts["existing_inquiry_new_item"]
    skipped_rows = counts["duplicate_item"] + counts["existing_inquiry_item_uncertain"] + counts["failed"]

    return ImportPreviewResult(
        file_name=result.file_name,
        sheet_name=result.sheet_name,
        total_rows=result.total_rows,
        new_inquiry_rows=counts["new"],
        existing_inquiry_new_item_rows=counts["existing_inquiry_new_item"],
        duplicate_item_rows=counts["duplicate_item"],
        uncertain_existing_item_rows=counts["existing_inquiry_item_uncertain"],
        failed_rows=counts["failed"],
        importable_rows=importable_rows,
        skipped_rows=skipped_rows,
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
    override_sales: str | None = None,
) -> uuid.UUID:
    """
    正式写库：
    - 设计说明：confirm 会重新解析 file_bytes（无服务端临时状态），与 preview 独立。
      MVP 阶段合理；大文件场景可改为存 preview_id + 缓存解析结果。
    - 新询单：insert
    - 真正重复（按写库结果实时判断，见 _classify_existing/state.reserve）：跳过
    - 解析失败：记录 error 日志，不写 inquiries
    调用方负责 commit。
    返回 import_batch_id。
    override_sales：admin/group_leader 手动指定归属业务员时，覆盖 Excel/文件名/默认值。
    """
    result: ParseResult = parse_excel_file(
        file_bytes, file_name, scope_user=scope_user,
        override_sales=_resolve_override_sales(override_sales, scope_user),
    )

    batch = await crud.create_import_batch(db, {
        "file_name": file_name,
        "uploaded_by": uploaded_by,
        "total_rows": result.total_rows,
        "status": "pending",
    })
    batch_id: uuid.UUID = batch.id

    counts = {
        "new": 0, "existing_inquiry_new_item": 0, "duplicate_item": 0,
        "existing_inquiry_item_uncertain": 0, "validation_failed": 0, "write_failed": 0,
    }
    import_row_logs: list[dict[str, Any]] = []
    state = _BatchState()
    # 本批次内已创建的询单（inquiry_no -> Inquiry），支持同一询单号下
    # 多个不同款式追加 inquiry_items，而不会被误判为重复询单（情况 B）。
    created_inquiries: dict[str, Any] = {}
    # 本批次内被追加新款式的已有询单 id，结束后统一重新扫描预警。
    # 只有真正成功追加（写库成功）的行才会进入这个集合。
    appended_inquiry_ids: set[uuid.UUID] = set()

    for pr in result.rows:
        # 解析失败行（必填字段缺失等，写库前就能判断）：记录 error
        # 同一询单号/同一款式键在文件内的重复，统一交给下面的 _write_valid_row
        # （内部调用 _classify_existing）按"实际写库结果"实时判断，不在这里
        # 提前根据"看起来重复"就跳过——否则第一行写库失败时，后面真正应该
        # 成功的同款行会被错误地当成 duplicate_item 跳过。
        if pr.status == "failed":
            counts["validation_failed"] += 1
            import_row_logs.append({
                "batch_id": batch_id, "row_number": pr.row_number, "inquiry_no": pr.inquiry_no,
                "status": "error",
                "raw_data_json": {k: str(v) for k, v in pr.raw_data.items()},
                "parsed_data_json": _to_json_safe(pr.parsed_data),
                "error_message": pr.error_message,
            })
            continue

        # 每一行的实际写库操作都被 _write_valid_row 内部用 SAVEPOINT 隔离：
        # 这一行写入异常只回滚这一行自己的改动，不会影响前面已成功的行，
        # 也不会让外层事务进入失败状态而拖累后面的行。
        final_status, err, appended_inquiry_id = await _write_valid_row(
            db, batch_id=batch_id, row_number=pr.row_number, inquiry_no=pr.inquiry_no,
            parsed_data=pr.parsed_data, state=state, created_inquiries=created_inquiries,
            scope_user=scope_user, file_name=file_name,
        )
        if appended_inquiry_id is not None:
            appended_inquiry_ids.add(appended_inquiry_id)
        log_status = "error" if final_status in ("validation_failed", "write_failed") else final_status
        counts[final_status] += 1
        import_row_logs.append({
            "batch_id": batch_id, "row_number": pr.row_number, "inquiry_no": pr.inquiry_no,
            "status": log_status, "raw_data_json": None, "parsed_data_json": None,
            "error_message": err,
        })

    # 批量写 import_rows 日志
    if import_row_logs:
        await crud.bulk_create_import_rows(db, import_row_logs)

    success = counts["new"] + counts["existing_inquiry_new_item"]
    failed = counts["validation_failed"] + counts["write_failed"]
    if failed == 0:
        final_batch_status = "success"
    elif success > 0:
        final_batch_status = "partial"
    else:
        final_batch_status = "failed"
    await crud.update_import_batch(db, batch_id, {
        "success_rows": success,
        "failed_rows": failed,  # 兼容旧字段：validation_failed + write_failed 之和
        "new_rows": counts["new"],
        "existing_rows": counts["existing_inquiry_new_item"],
        "duplicate_rows": counts["duplicate_item"],
        "uncertain_rows": counts["existing_inquiry_item_uncertain"],
        "validation_failed_rows": counts["validation_failed"],
        "write_failed_rows": counts["write_failed"],
        "status": final_batch_status,
    })

    # 对本批次新写入的询单运行预警扫描
    from sqlalchemy import select
    from app.models import Inquiry
    result = await db.execute(select(Inquiry).where(Inquiry.import_batch_id == batch_id))
    for inq in result.scalars().all():
        await scan_inquiry_warnings(db, inq)

    # 本批次内被追加新款式的已有询单：单独重新扫描预警（不影响导入结果）
    await _rescan_appended_inquiries(db, appended_inquiry_ids, scope_user, batch_id, file_name)

    return batch_id


async def _rescan_appended_inquiries(
    db: AsyncSession,
    inquiry_ids: set[uuid.UUID],
    scope_user: Any,
    batch_id: uuid.UUID,
    file_name: str,
) -> None:
    """
    对本批次内被追加新款式明细的已有询单重新运行预警检查（增量扫描，
    复用 run_check_for_inquiries：已存在的未处理预警不会被重复生成，
    已修复的问题会被清理，只新增真正的新问题）。
    重跑失败不影响导入结果，仅记录后端错误日志。
    """
    if not inquiry_ids:
        return

    import logging
    from sqlalchemy import select
    from app.models import Inquiry
    from app.services.warning_service import run_check_for_inquiries

    try:
        result = await db.execute(select(Inquiry).where(Inquiry.id.in_(inquiry_ids)))
        inquiries = list(result.scalars().all())
        scan_result = await run_check_for_inquiries(db, inquiries)
        await safe_log(
            **(log_kwargs_from_user(scope_user) if scope_user is not None else {"actor_username": "system"}),
            action_type="warning_run_check",
            target_type="system",
            description="导入追加款式后重新运行预警检查",
            after_data={
                "file_name": file_name,
                "import_batch_id": str(batch_id),
                "checked_inquiry_count": scan_result.get("scanned", 0),
                "created_warning_count": scan_result.get("warnings_added", 0),
                "resolved_warning_count": scan_result.get("warnings_removed", 0),
            },
        )
    except Exception as exc:
        logging.getLogger("rfq").error(
            "追加款式后重新扫描预警失败（batch_id=%s）：%s", batch_id, exc,
        )


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
            elif key in INT_FIELDS or key == "inquiry_year":
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
    override_sales: str | None = None,
) -> uuid.UUID:
    """
    接收前端编辑后的行数据，直接写入 DB，不重新解析 Excel。
    用于可编辑预览确认导入场景。调用方负责 commit。
    override_sales：admin/group_leader 手动指定归属业务员时，覆盖前端传来的值。
    """
    resolved_override_sales = _resolve_override_sales(override_sales, scope_user)

    batch = await crud.create_import_batch(db, {
        "file_name": file_name,
        "uploaded_by": uploaded_by,
        "total_rows": len(rows),
        "status": "pending",
    })
    batch_id: uuid.UUID = batch.id

    counts = {
        "new": 0, "existing_inquiry_new_item": 0, "duplicate_item": 0,
        "existing_inquiry_item_uncertain": 0, "validation_failed": 0, "write_failed": 0,
    }
    logs: list[dict[str, Any]] = []
    state = _BatchState()
    created_inquiries: dict[str, Any] = {}
    appended_inquiry_ids: set[uuid.UUID] = set()

    # 行按 row_number 从小到大处理，保证"第一条先尝试，失败后第二条同款仍可
    # 重试"的顺序是确定、可解释的（即使调用方传入的顺序不是排好序的）。
    for row_item in sorted(rows, key=lambda r: r.get("row_number", 0)):
        row_num: int = row_item["row_number"]
        raw_parsed: dict[str, Any] = row_item["parsed_data"]

        # 优先从 parsed_data 读 inquiry_no（可能被用户编辑过）
        inquiry_no = str(
            raw_parsed.get("inquiry_no") or row_item.get("inquiry_no") or ""
        ).strip() or None

        if not inquiry_no:
            counts["validation_failed"] += 1
            logs.append({
                "batch_id": batch_id, "row_number": row_num, "inquiry_no": None,
                "status": "error", "error_message": "缺少询单号",
                "raw_data_json": None, "parsed_data_json": None,
            })
            continue

        # 同询单号/同款式键的文件内重复，统一交给下面的 _write_valid_row
        # （内部调用 _classify_existing）按"实际写库结果"实时判断，不在这里
        # 提前根据"看起来重复"就跳过——否则第一行写库失败时，后面真正应该
        # 成功的同款行会被错误地当成 duplicate_item 跳过。

        clean = _coerce_row_data(raw_parsed)

        # 优先级：手动指定的归属业务员 > 业务员本人强制 > Excel/前端原值 > 上传账号默认值
        if resolved_override_sales:
            clean["responsible_sales"] = resolved_override_sales
        elif scope_user is not None:
            uploader_name = (
                getattr(scope_user, "display_name", None) or getattr(scope_user, "username", None)
            )
            if getattr(scope_user, "role", None) == "sales":
                clean["responsible_sales"] = uploader_name
            else:
                clean.setdefault("responsible_sales", uploader_name)

        # 每一行的实际写库操作都被 _write_valid_row 内部用 SAVEPOINT 隔离，
        # 单行写入异常不会拖垮同批次其他行。
        final_status, err, appended_inquiry_id = await _write_valid_row(
            db, batch_id=batch_id, row_number=row_num, inquiry_no=inquiry_no, parsed_data=clean,
            state=state, created_inquiries=created_inquiries, scope_user=scope_user,
            file_name=file_name,
        )
        if appended_inquiry_id is not None:
            appended_inquiry_ids.add(appended_inquiry_id)
        log_status = "error" if final_status in ("validation_failed", "write_failed") else final_status
        counts[final_status] += 1
        logs.append({
            "batch_id": batch_id, "row_number": row_num, "inquiry_no": inquiry_no,
            "status": log_status, "error_message": err,
            "raw_data_json": None, "parsed_data_json": None,
        })

    if logs:
        await crud.bulk_create_import_rows(db, logs)

    success = counts["new"] + counts["existing_inquiry_new_item"]
    failed = counts["validation_failed"] + counts["write_failed"]
    final_status = "success" if failed == 0 else ("partial" if success > 0 else "failed")
    await crud.update_import_batch(db, batch_id, {
        "success_rows": success, "failed_rows": failed,
        "new_rows": counts["new"], "existing_rows": counts["existing_inquiry_new_item"],
        "duplicate_rows": counts["duplicate_item"], "uncertain_rows": counts["existing_inquiry_item_uncertain"],
        "validation_failed_rows": counts["validation_failed"], "write_failed_rows": counts["write_failed"],
        "status": final_status,
    })

    # 对本批次新写入的询单运行预警扫描
    from sqlalchemy import select
    from app.models import Inquiry
    result = await db.execute(select(Inquiry).where(Inquiry.import_batch_id == batch_id))
    for inq in result.scalars().all():
        await scan_inquiry_warnings(db, inq)

    # 本批次内被追加新款式的已有询单：单独重新扫描预警（不影响导入结果）
    await _rescan_appended_inquiries(db, appended_inquiry_ids, scope_user, batch_id, file_name)

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
        # 用独立 savepoint 包裹：工厂同步失败不应影响已经成功写入的询单本身
        # （也不能让失败的 flush 污染外层、导致整行被错误地判定为写入失败）。
        async with db.begin_nested():
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
