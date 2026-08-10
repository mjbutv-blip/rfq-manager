from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.permissions import can_edit_inquiry
from app.models import Customer, ImportBatch, ImportRow, Inquiry, InquiryItem, OperationLog, OrderGroup, OrderGroupItem, OrderSeries, OrderSeriesItem
from app.services.excel_parser import _load_workbook
from app.services.operation_log_service import log_kwargs_from_user, safe_log

SOURCE_SHEETS = ("总表", "总表海外", "海外报价表-美金")
MAX_TRAILING_EMPTY_ROWS = 200


@dataclass
class BaseImportRow:
    source_sheet: str
    row_number: int
    inquiry_no: str | None
    customer_order_no: str | None = None
    season: str | None = None
    order_status: str | None = None
    inquiry_date: date | None = None
    customer_code: str | None = None
    product_name: str | None = None
    product_category: str | None = None
    series_name: str | None = None
    fabric_quality: str | None = None
    color_print: str | None = None
    size_range: str | None = None
    quantity: int | None = None
    style_no: str | None = None
    notes: str | None = None
    document_series_name: str | None = None
    order_group_marker: str | None = None
    order_group_marker_scope: str | None = None
    raw_data: dict[str, Any] | None = None


def _clean_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in {"#N/A", "#DIV/0!", "#NUM!", "#VALUE!"}:
        return None
    return s


def _clean_optional(v: Any) -> str | None:
    s = _clean_str(v)
    if not s:
        return None
    if s in {"0", "0.0", "—", "-", "--", "——", "———", "————", "_", "__", "___", "/", "／"}:
        return None
    return s


def _clean_inquiry_no(v: Any) -> str | None:
    s = _clean_str(v)
    if not s:
        return None
    first = re.split(r"[\s（(]", s, maxsplit=1)[0].strip()
    if not re.search(r"[A-Za-z]", first):
        return None
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_-]*$", first):
        return None
    return first


def _to_int(v: Any) -> int | None:
    if v is None:
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    s = str(v)
    total_match = re.search(r"共\s*(\d[\d,]*)\s*件", s)
    if total_match:
        return int(total_match.group(1).replace(",", ""))
    matches = [int(m.replace(",", "")) for m in re.findall(r"\d[\d,]*", s)]
    if not matches:
        return None
    return max(matches)


def _to_date(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    return None


def _json_value(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    return False


def _inquiry_fill_candidates(row: BaseImportRow, customer: Customer | None = None) -> tuple[tuple[str, Any], ...]:
    return (
        ("customer_code", row.customer_code),
        ("customer_short_name", customer.customer_short_name if customer else None),
        ("customer_order_no", row.customer_order_no),
        ("season", row.season),
        ("order_status", row.order_status),
        ("inquiry_date", row.inquiry_date),
        ("product_category", row.product_category),
        ("product_name", row.product_name),
        ("series_name", row.series_name),
        ("quantity", row.quantity),
        ("remark", row.notes),
    )


def _user_display_name(user: Any) -> str | None:
    return getattr(user, "display_name", None) or getattr(user, "username", None)


def _fillable_inquiry_fields(inquiry: Inquiry, row: BaseImportRow, customer: Customer | None = None, user: Any | None = None) -> list[str]:
    candidates = list(_inquiry_fill_candidates(row, customer))
    if user is not None:
        candidates.extend((
            ("responsible_sales", _user_display_name(user)),
            ("group_name", getattr(user, "group_name", None)),
        ))
    return [
        field
        for field, value in candidates
        if value is not None and _is_empty(getattr(inquiry, field, None))
    ]


def _fill_empty_inquiry_fields(inquiry: Inquiry, row: BaseImportRow, customer: Customer | None = None, user: Any | None = None) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    candidates = list(_inquiry_fill_candidates(row, customer))
    if user is not None:
        candidates.extend((
            ("responsible_sales", _user_display_name(user)),
            ("group_name", getattr(user, "group_name", None)),
        ))
    for field, value in candidates:
        if value is not None and _is_empty(getattr(inquiry, field, None)):
            setattr(inquiry, field, value)
            updates[field] = _json_value(value)
    return updates


def _item_fill_candidates(row: BaseImportRow) -> tuple[tuple[str, Any], ...]:
    return (
        ("product_name", row.product_name),
        ("product_category", row.product_category),
        ("series_name", row.series_name),
        ("fabric_quality", row.fabric_quality),
        ("color_print", row.color_print),
        ("size_range", row.size_range),
        ("quantity", row.quantity),
        ("style_no", row.style_no),
        ("order_status", row.order_status),
    )


def _fillable_item_fields(item: InquiryItem | None, row: BaseImportRow) -> list[str]:
    if item is None:
        return []
    return [
        field
        for field, value in _item_fill_candidates(row)
        if value is not None and _is_empty(getattr(item, field, None))
    ]


def _fill_empty_item_fields(item: InquiryItem, row: BaseImportRow) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for field, value in _item_fill_candidates(row):
        if value is not None and _is_empty(getattr(item, field, None)):
            setattr(item, field, value)
            updates[field] = _json_value(value)
    return updates


def _header_map(ws) -> dict[str, int]:
    headers: dict[str, int] = {}
    max_header_row = min(ws.max_row, 4)
    for r in range(1, max_header_row + 1):
        for c in range(1, ws.max_column + 1):
            val = _clean_str(ws.cell(r, c).value)
            if val and val not in headers:
                headers[val] = c
    return headers


def _find_header(headers: dict[str, int], *names: str) -> int | None:
    for name in names:
        if name in headers:
            return headers[name]
    for header, col in headers.items():
        compact = header.replace("\n", "").replace(" ", "")
        if any(name in compact for name in names):
            return col
    return None


def _cell(ws, row: int, col: int | None) -> Any:
    return ws.cell(row, col).value if col else None


def _merged_parent_range(ws, row: int, col: int | None):
    if not col:
        return None
    for merged_range in ws.merged_cells.ranges:
        if merged_range.min_row <= row <= merged_range.max_row and merged_range.min_col <= col <= merged_range.max_col:
            return merged_range
    return None


def _cell_with_merged(ws, row: int, col: int | None) -> Any:
    if not col:
        return None
    merged_range = _merged_parent_range(ws, row, col)
    if merged_range:
        return ws.cell(merged_range.min_row, merged_range.min_col).value
    return ws.cell(row, col).value


def _is_order_group_marker(value: str | None) -> bool:
    if not value:
        return False
    compact = re.sub(r"\s+", "", value)
    return any(token in compact for token in ("一套", "同套", "一组", "同组", "配套", "套装", "一整套"))


def _order_group_marker_size(value: str | None) -> int | None:
    if not value:
        return None
    compact = re.sub(r"\s+", "", value)
    if any(token in compact for token in ("两个", "2个", "二个", "两款", "二款", "2款", "两单", "二单", "2单")):
        return 2
    if any(token in compact for token in ("三个", "3个", "三款", "3款", "三单", "3单")):
        return 3
    if any(token in compact for token in ("四个", "4个", "四款", "4款", "四单", "4单")):
        return 4
    return None


def _document_series_name(file_name: str, ws) -> str | None:
    title = _clean_optional(ws.cell(2, 1).value) or _clean_optional(file_name.rsplit("/", 1)[-1])
    if title and title in {"询单号", "订单号", "系列", "品名"}:
        title = _clean_optional(file_name.rsplit("/", 1)[-1])
    if not title:
        return None
    title = re.sub(r"\.(xlsx|xlsm|xls)$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"\s*(德国|美国|英国|日本|国内|海外)\s*$", "", title)
    title = re.sub(r"(单报价单|报价单|单)$", "", title).strip()
    return title or None


def _notes(*parts: tuple[str, Any]) -> str | None:
    chunks = []
    for label, value in parts:
        s = _clean_str(value)
        if s:
            chunks.append(f"{label}：{s}")
    return "\n\n".join(chunks) if chunks else None


def _item_key(row: BaseImportRow) -> tuple[str, str | None, bool]:
    if row.style_no:
        return ("style", row.style_no.strip().lower(), False)
    product = (row.product_name or "").strip().lower()
    series = (row.series_name or "").strip().lower()
    if product or series:
        return ("product_series", f"{product}|{series}", False)
    return ("uncertain", None, True)


def _is_non_default_fill(fill_key: str | None) -> bool:
    if not fill_key:
        return False
    fill_key = str(fill_key)
    normalized = fill_key.upper().replace("00", "", 1) if fill_key.upper().startswith("00") else fill_key.upper()
    return normalized not in {"000000", "FFFFFF", "FFFFFFFF", "00000000", "NONE"}


def _row_visual_signature(ws, row: int) -> str | None:
    fills = []
    for col in range(1, min(ws.max_column, 8) + 1):
        cell = ws.cell(row, col)
        color = cell.fill.fgColor.rgb or cell.fill.start_color.rgb
        if color and _is_non_default_fill(color):
            fills.append(str(color))
    if not fills:
        return None
    # 同一行里出现次数最多的非默认底色，作为区域识别信号。
    return max(set(fills), key=fills.count)


def _detect_order_group_candidates(rows: list[BaseImportRow], visual_signals: dict[tuple[str, int], str | None]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, ...]] = set()
    by_sheet: dict[str, list[BaseImportRow]] = {}
    for row in rows:
        if row.inquiry_no:
            by_sheet.setdefault(row.source_sheet, []).append(row)

    def add_candidate(
        sheet: str,
        group_rows: list[BaseImportRow],
        basis: list[str],
        confidence: float,
        status: str,
        default_confirmed: bool,
        group_marker: str | None,
    ) -> None:
        ordered = sorted(group_rows, key=lambda r: r.row_number)
        inquiry_nos = list(dict.fromkeys([r.inquiry_no for r in ordered if r.inquiry_no]))
        if len(inquiry_nos) < 2:
            return
        dedupe_key = ("|".join(inquiry_nos),)
        if dedupe_key in seen_keys:
            return
        seen_keys.add(dedupe_key)
        start, end = ordered[0].row_number, ordered[-1].row_number
        candidates.append({
            "key": f"{sheet}:{start}-{end}:{group_marker or ''}:{'-'.join(inquiry_nos)}",
            "source_sheet": sheet,
            "source_start_row": start,
            "source_end_row": end,
            "inquiry_nos": inquiry_nos,
            "basis": basis,
            "confidence": confidence,
            "status": status,
            "default_confirmed": default_confirmed,
            "document_series_name": ordered[0].document_series_name,
            "group_marker": group_marker,
        })

    for sheet, sheet_rows in by_sheet.items():
        marker_scope_groups: dict[str, list[BaseImportRow]] = {}
        for row in sheet_rows:
            if row.order_group_marker and _is_order_group_marker(row.order_group_marker):
                if row.order_group_marker_scope:
                    marker_scope_groups.setdefault(row.order_group_marker_scope, []).append(row)

        for marker_rows in marker_scope_groups.values():
            marker = marker_rows[0].order_group_marker
            add_candidate(
                sheet,
                marker_rows,
                [f"系列名列标注：{marker}", "标记单元格合并范围内的询单"],
                0.98,
                "pending_confirm",
                True,
                marker,
            )

        ordered_rows = sorted(sheet_rows, key=lambda r: r.row_number)
        for index, row in enumerate(ordered_rows):
            marker = row.order_group_marker
            if not marker or not _is_order_group_marker(marker) or row.order_group_marker_scope:
                continue
            marker_size = _order_group_marker_size(marker)
            if not marker_size:
                continue
            group_rows = []
            unique_nos: set[str] = set()
            for next_row in ordered_rows[index:]:
                if next_row.row_number - row.row_number > max(marker_size * 4, 8):
                    break
                if next_row.inquiry_no:
                    group_rows.append(next_row)
                    unique_nos.add(next_row.inquiry_no)
                if len(unique_nos) >= marker_size:
                    break
            if len(unique_nos) >= marker_size:
                add_candidate(
                    sheet,
                    group_rows,
                    [f"系列名列标注：{marker}", f"按标记向下识别 {marker_size} 个不同询单号"],
                    0.92,
                    "pending_confirm",
                    True,
                    marker,
                )

        current: list[BaseImportRow] = []
        current_signal: str | None = None
        for row in sorted(sheet_rows, key=lambda r: r.row_number):
            signal = visual_signals.get((sheet, row.row_number))
            is_contiguous = bool(current and row.row_number == current[-1].row_number + 1)
            if current and is_contiguous and signal and signal == current_signal:
                current.append(row)
            else:
                if len(current) >= 2 and current_signal:
                    add_candidate(sheet, current, ["连续行", "相同底色/视觉区域"], 0.55, "group_candidate_uncertain", False, None)
                current = [row]
                current_signal = signal
        if len(current) >= 2 and current_signal:
            add_candidate(sheet, current, ["连续行", "相同底色/视觉区域"], 0.55, "group_candidate_uncertain", False, None)
    return candidates


def _parse_workbook(file_bytes: bytes, uniform_customer_code: str | None = None, file_name: str = "") -> tuple[list[BaseImportRow], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    wb = _load_workbook(file_bytes)
    rows: list[BaseImportRow] = []
    sheet_stats: dict[str, Any] = {}
    visual_signals: dict[tuple[str, int], str | None] = {}
    document_series: list[dict[str, Any]] = []
    uniform_customer_code = _clean_optional(uniform_customer_code)

    for sheet_name in SOURCE_SHEETS:
        if sheet_name not in wb.sheetnames:
            sheet_stats[sheet_name] = {"rows": 0, "present": False}
            continue
        ws = wb[sheet_name]
        doc_series_name = _document_series_name(file_name, ws)
        headers = _header_map(ws)
        inquiry_col = _find_header(headers, "询单号")
        order_col = _find_header(headers, "订单号", "客户订单号")
        series_col = _find_header(headers, "系列")
        season_col = _find_header(headers, "季节")
        product_col = _find_header(headers, "品名")
        fabric_col = _find_header(headers, "面料品质--正染", "面料品质", "面料")
        color_col = _find_header(headers, "面料颜色/印花", "颜色/印花", "颜色")
        size_col = _find_header(headers, "尺码范围", "尺码")
        qty_col = _find_header(headers, "数量") if sheet_name in {"总表", "总表海外"} else None
        style_col = _find_header(headers, "做工图/尺码表", "款号", "style_no")
        order_status_col = 20 if sheet_name in {"总表", "总表海外"} else None
        customer_code_col = _find_header(headers, "客户代码", "客户编号")
        inquiry_date_col = _find_header(headers, "询单日期")

        start_row = 3 if sheet_name in {"总表", "总表海外"} else 5
        parsed_rows = 0
        empty_streak = 0
        sheet_inquiry_nos: list[str] = []
        for r in range(start_row, ws.max_row + 1):
            raw_inquiry_no = _clean_str(_cell(ws, r, inquiry_col))
            inquiry_no = _clean_inquiry_no(raw_inquiry_no)
            customer_order_no = _clean_optional(_cell(ws, r, order_col))
            product_name = _clean_optional(_cell(ws, r, product_col))
            if not inquiry_no and not any(_clean_str(ws.cell(r, c).value) for c in range(1, min(ws.max_column, 8) + 1)):
                empty_streak += 1
                if empty_streak >= MAX_TRAILING_EMPTY_ROWS:
                    break
                continue
            empty_streak = 0
            visual_signals[(sheet_name, r)] = _row_visual_signature(ws, r)
            if not inquiry_no and raw_inquiry_no and not re.search(r"[A-Za-z]", raw_inquiry_no):
                continue
            if not inquiry_no and not customer_order_no and not product_name:
                continue
            if not inquiry_no:
                rows.append(BaseImportRow(
                    source_sheet=sheet_name,
                    row_number=r,
                    inquiry_no=None,
                    raw_data={"error": "询单号为空", "source": f"{sheet_name}!{r}"},
                ))
                parsed_rows += 1
                continue

            if not customer_order_no and not product_name:
                continue

            raw_series_name = _clean_optional(_cell_with_merged(ws, r, series_col))
            order_group_marker = raw_series_name if _is_order_group_marker(raw_series_name) else None
            marker_scope = None
            if order_group_marker:
                marker_range = _merged_parent_range(ws, r, series_col)
                if marker_range:
                    marker_scope = f"{sheet_name}:{marker_range.coord}:{order_group_marker}"
            series_name = doc_series_name if order_group_marker or not raw_series_name else raw_series_name
            customer_code = _clean_optional(_cell(ws, r, customer_code_col)) or uniform_customer_code
            row = BaseImportRow(
                source_sheet=sheet_name,
                row_number=r,
                inquiry_no=inquiry_no,
                customer_order_no=customer_order_no,
                season=_clean_optional(_cell(ws, r, season_col)),
                order_status=_clean_optional(_cell(ws, r, order_status_col)),
                inquiry_date=_to_date(_cell(ws, r, inquiry_date_col)),
                customer_code=customer_code,
                product_name=product_name,
                product_category=None,
                series_name=series_name,
                fabric_quality=_clean_optional(_cell(ws, r, fabric_col)),
                color_print=_clean_optional(_cell(ws, r, color_col)),
                size_range=_clean_optional(_cell(ws, r, size_col)),
                quantity=_to_int(_cell(ws, r, qty_col)),
                style_no=_clean_optional(_cell(ws, r, style_col)),
                notes=_notes(
                    ("强调内容", ws.cell(r, 7).value if sheet_name in {"总表", "总表海外"} else None),
                    ("建议内容", ws.cell(r, 8).value if sheet_name in {"总表", "总表海外"} else None),
                    ("工厂回复", ws.cell(r, 9).value if sheet_name in {"总表", "总表海外"} else None),
                ),
                document_series_name=doc_series_name,
                order_group_marker=order_group_marker,
                order_group_marker_scope=marker_scope,
                raw_data={
                    "source_sheet": sheet_name,
                    "row_number": r,
                    "inquiry_no": inquiry_no,
                    "document_series_name": doc_series_name,
                    "order_group_marker": order_group_marker,
                    "order_group_marker_scope": marker_scope,
                    "customer_code_source": "excel" if _clean_optional(_cell(ws, r, customer_code_col)) else ("uniform_input" if customer_code else None),
                },
            )
            rows.append(row)
            sheet_inquiry_nos.append(inquiry_no)
            parsed_rows += 1
        sheet_stats[sheet_name] = {
            "rows": parsed_rows,
            "present": True,
            "layout": "一行一个款式/报价场景，询单号可跨多行",
            "has_customer_code_column": customer_code_col is not None,
            "document_series_name": doc_series_name,
        }
        if sheet_inquiry_nos:
            document_series.append({
                "source_sheet": sheet_name,
                "series_name": doc_series_name,
                "inquiry_nos": sheet_inquiry_nos,
                "inquiry_count": len(sheet_inquiry_nos),
                "basis": ["同一 Excel 文件", "同一总表 sheet"],
            })
    return rows, sheet_stats, _detect_order_group_candidates(rows, visual_signals), document_series


async def _load_customers(db: AsyncSession, codes: set[str]) -> dict[str, Customer]:
    if not codes:
        return {}
    result = await db.execute(select(Customer).where(Customer.customer_code.in_(codes)))
    return {c.customer_code: c for c in result.scalars().all()}


async def _load_inquiries(db: AsyncSession, inquiry_nos: set[str]) -> dict[str, Inquiry]:
    if not inquiry_nos:
        return {}
    result = await db.execute(select(Inquiry).where(Inquiry.inquiry_no.in_(inquiry_nos)))
    return {i.inquiry_no: i for i in result.scalars().all()}


async def _load_items(db: AsyncSession, inquiry_nos: set[str]) -> dict[str, dict[tuple[str, str | None], InquiryItem]]:
    if not inquiry_nos:
        return {}
    result = await db.execute(select(InquiryItem).where(InquiryItem.inquiry_no.in_(inquiry_nos)))
    items: dict[str, dict[tuple[str, str | None], InquiryItem]] = {}
    for item in result.scalars().all():
        pseudo = BaseImportRow(
            source_sheet="db",
            row_number=0,
            inquiry_no=item.inquiry_no,
            product_name=item.product_name,
            series_name=item.series_name,
            style_no=item.style_no,
        )
        key_type, key, uncertain = _item_key(pseudo)
        if not uncertain:
            items.setdefault(item.inquiry_no or "", {})[(key_type, key)] = item
    return items


def _row_payload(row: BaseImportRow) -> dict[str, Any]:
    return {
        "source_sheet": row.source_sheet,
        "row_number": row.row_number,
        "inquiry_no": row.inquiry_no,
        "customer_order_no": row.customer_order_no,
        "season": row.season,
        "order_status": row.order_status,
        "inquiry_date": _json_value(row.inquiry_date),
        "customer_code": row.customer_code,
        "product_name": row.product_name,
        "product_category": row.product_category,
        "series_name": row.series_name,
        "fabric_quality": row.fabric_quality,
        "color_print": row.color_print,
        "size_range": row.size_range,
        "quantity": row.quantity,
        "style_no": row.style_no,
        "notes": row.notes,
        "document_series_name": row.document_series_name,
        "order_group_marker": row.order_group_marker,
    }


async def preview_base_inquiry_import(
    db: AsyncSession,
    file_bytes: bytes,
    file_name: str,
    user: Any,
    uniform_customer_code: str | None = None,
) -> dict[str, Any]:
    parsed_rows, sheet_stats, order_group_candidates, document_series = _parse_workbook(file_bytes, uniform_customer_code, file_name)
    inquiry_nos = {r.inquiry_no for r in parsed_rows if r.inquiry_no}
    customer_codes = {r.customer_code for r in parsed_rows if r.customer_code}
    inquiries = await _load_inquiries(db, inquiry_nos)
    customers = await _load_customers(db, customer_codes)
    existing_items = await _load_items(db, inquiry_nos)
    seen_items: dict[str, set[tuple[str, str | None]]] = {}
    seen_new_inquiries: set[str] = set()

    summary = {
        "total_rows": 0,
        "new_inquiries": 0,
        "new_items": 0,
        "existing_inquiries": 0,
        "duplicate_items": 0,
        "customer_unmatched": 0,
        "item_identity_uncertain": 0,
        "fillable_inquiry_fields": 0,
        "failed": 0,
        "importable_rows": 0,
        "order_group_candidates": len(order_group_candidates),
    }
    rows: list[dict[str, Any]] = []

    for row in parsed_rows:
        summary["total_rows"] += 1
        flags: list[str] = []
        errors: list[str] = []
        status = "new_inquiry"
        fillable_inquiry_fields: list[str] = []
        if not row.inquiry_no:
            status = "failed"
            errors.append("Excel 询单号为空")
            summary["failed"] += 1
            rows.append({
                **_row_payload(row),
                "status": status,
                "flags": flags,
                "errors": errors,
                "item_identity_key": None,
                "fillable_inquiry_fields": fillable_inquiry_fields,
                "customer_matched": False,
                "customer_will_create": False,
                "can_confirm": False,
            })
            continue

        existing_inquiry = inquiries.get(row.inquiry_no)
        if existing_inquiry:
            status = "existing_inquiry"
            flags.append("existing_inquiry")
            summary["existing_inquiries"] += 1
            can_write_inquiry = can_edit_inquiry(existing_inquiry, user)
            if not can_write_inquiry:
                status = "failed"
                errors.append("无权限向该询单追加款式")
            else:
                matched_customer = customers.get(row.customer_code or "") if row.customer_code else None
                fillable_inquiry_fields = _fillable_inquiry_fields(existing_inquiry, row, matched_customer, user)
                summary["fillable_inquiry_fields"] += len(fillable_inquiry_fields)
        elif row.inquiry_no in seen_new_inquiries:
            status = "new_item_for_existing_inquiry"
        else:
            status = "new_inquiry"
            seen_new_inquiries.add(row.inquiry_no)
            summary["new_inquiries"] += 1

        if not row.customer_code:
            flags.append("customer_unmatched")
            summary["customer_unmatched"] += 1
        customer_will_create = bool(row.customer_code and row.customer_code not in customers)

        key_type, key, uncertain = _item_key(row)
        if uncertain:
            flags.append("item_identity_uncertain")
            summary["item_identity_uncertain"] += 1
            duplicate = False
        else:
            key_tuple = (key_type, key)
            existing_item = existing_items.get(row.inquiry_no, {}).get(key_tuple)
            duplicate = existing_item is not None or key_tuple in seen_items.get(row.inquiry_no, set())
        if duplicate:
            status = "duplicate_item"
            flags.append("duplicate_item")
            summary["duplicate_items"] += 1
            fillable_item_fields = _fillable_item_fields(existing_item, row)
        else:
            fillable_item_fields = []
            seen_items.setdefault(row.inquiry_no, set()).add((key_type, key))
            if status != "failed":
                summary["new_items"] += 1

        can_confirm = status != "failed" and (
            status != "duplicate_item"
            or bool(fillable_inquiry_fields)
            or bool(fillable_item_fields)
        )
        if can_confirm:
            summary["importable_rows"] += 1

        rows.append({
            **_row_payload(row),
            "status": status,
            "flags": flags,
            "errors": errors,
            "item_identity_key": f"{key_type}:{key}" if key else key_type,
            "fillable_inquiry_fields": fillable_inquiry_fields,
            "fillable_item_fields": fillable_item_fields,
            "customer_matched": bool(row.customer_code and row.customer_code in customers),
            "customer_will_create": customer_will_create,
            "can_confirm": can_confirm,
        })

    return {
        "file_name": file_name,
        "sheet_stats": sheet_stats,
        "summary": summary,
        "rows": rows,
        "order_group_candidates": order_group_candidates,
        "document_series": document_series,
        "uniform_customer_code": _clean_optional(uniform_customer_code),
    }


async def _log_in_session(db: AsyncSession, user: Any, **kwargs: Any) -> None:
    if "before_data" in kwargs:
        kwargs["before_data_json"] = kwargs.pop("before_data")
    if "after_data" in kwargs:
        kwargs["after_data_json"] = kwargs.pop("after_data")
    log = OperationLog(**log_kwargs_from_user(user), **kwargs)
    db.add(log)


async def _get_or_create_customer(db: AsyncSession, customer_code: str | None) -> tuple[Customer | None, bool]:
    if not customer_code:
        return None, False
    customer = (await db.execute(select(Customer).where(Customer.customer_code == customer_code))).scalars().first()
    if customer:
        return customer, False
    customer = Customer(customer_code=customer_code)
    db.add(customer)
    await db.flush()
    return customer, True


async def confirm_base_inquiry_import(
    db: AsyncSession,
    file_bytes: bytes,
    file_name: str,
    user: Any,
    uniform_customer_code: str | None = None,
    confirmed_order_group_keys: list[str] | None = None,
) -> dict[str, Any]:
    preview = await preview_base_inquiry_import(db, file_bytes, file_name, user, uniform_customer_code)
    batch = await crud.create_import_batch(db, {
        "file_name": file_name,
        "uploaded_by": getattr(user, "username", None),
        "total_rows": preview["summary"]["total_rows"],
        "status": "pending",
    })
    await db.flush()

    summary = {
        "created_inquiries": 0,
        "created_items": 0,
        "updated_inquiry_fields": 0,
        "updated_item_fields": 0,
        "existing_inquiries": 0,
        "duplicate_items_skipped": 0,
        "customer_records_created": 0,
        "customer_unmatched_rows": 0,
        "uncertain_item_rows": 0,
        "write_failed_rows": 0,
        "created_order_series": 0,
        "partial_order_series": 0,
        "created_order_groups": 0,
        "partial_order_groups": 0,
    }
    results: list[dict[str, Any]] = []
    created_inquiries: dict[str, Inquiry] = {}
    successful_inquiries: dict[str, Inquiry] = {}
    created_item_keys: dict[str, set[tuple[str, str | None]]] = {}
    existing_items = await _load_items(db, {r["inquiry_no"] for r in preview["rows"] if r.get("inquiry_no")})

    for row_data in preview["rows"]:
        status = row_data["status"]
        row = BaseImportRow(
            source_sheet=row_data["source_sheet"],
            row_number=row_data["row_number"],
            inquiry_no=row_data["inquiry_no"],
            customer_order_no=row_data["customer_order_no"],
            season=row_data["season"],
            order_status=row_data["order_status"],
            inquiry_date=_to_date(row_data["inquiry_date"]),
            customer_code=row_data["customer_code"],
            product_name=row_data["product_name"],
            product_category=row_data["product_category"],
            series_name=row_data["series_name"],
            fabric_quality=row_data.get("fabric_quality"),
            color_print=row_data.get("color_print"),
            size_range=row_data.get("size_range"),
            quantity=row_data["quantity"],
            style_no=row_data["style_no"],
            notes=row_data["notes"],
            document_series_name=row_data.get("document_series_name"),
            order_group_marker=row_data.get("order_group_marker"),
        )
        import_status = status
        error_message = None

        if status == "failed":
            summary["write_failed_rows"] += 1
        else:
            try:
                async with db.begin_nested():
                    customer, customer_created = await _get_or_create_customer(db, row.customer_code)
                    if customer_created:
                        summary["customer_records_created"] += 1

                    inquiry = created_inquiries.get(row.inquiry_no or "")
                    if inquiry is None:
                        inquiry = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == row.inquiry_no))).scalars().first()

                    if inquiry:
                        if row_data["status"] == "existing_inquiry":
                            summary["existing_inquiries"] += 1
                        if not can_edit_inquiry(inquiry, user):
                            raise PermissionError("无权限向该询单追加款式")
                        updates = _fill_empty_inquiry_fields(inquiry, row, customer, user)
                        if updates:
                            summary["updated_inquiry_fields"] += len(updates)
                            await _log_in_session(
                                db,
                                user,
                                action_type="base_inquiry_import_field_fill_from_excel",
                                target_type="inquiry",
                                target_id=str(inquiry.id),
                                inquiry_id=inquiry.id,
                                inquiry_no=inquiry.inquiry_no,
                                description="基础询单导入补齐询单主表空字段",
                                after_data={
                                    "excel_file": file_name,
                                    "sheet": row.source_sheet,
                                    "row": row.row_number,
                                    "updated_fields": updates,
                                },
                            )
                    else:
                        inquiry = Inquiry(
                            inquiry_no=row.inquiry_no or "",
                            customer_code=row.customer_code,
                            customer_short_name=customer.customer_short_name if customer else None,
                            customer_order_no=row.customer_order_no,
                            season=row.season,
                            order_status=row.order_status,
                            inquiry_date=row.inquiry_date,
                            product_category=row.product_category,
                            product_name=row.product_name,
                            series_name=row.series_name,
                            quantity=row.quantity,
                            group_name=getattr(user, "group_name", None),
                            responsible_sales=_user_display_name(user),
                            remark=row.notes,
                            import_batch_id=batch.id,
                        )
                        db.add(inquiry)
                        await db.flush()
                        created_inquiries[row.inquiry_no or ""] = inquiry
                        summary["created_inquiries"] += 1
                        await _log_in_session(
                            db,
                            user,
                            action_type="base_inquiry_create_from_excel",
                            target_type="inquiry",
                            target_id=str(inquiry.id),
                            inquiry_id=inquiry.id,
                            inquiry_no=inquiry.inquiry_no,
                            description="从 Excel 创建基础询单",
                            after_data={**_row_payload(row), "excel_file": file_name},
                        )
                    successful_inquiries[inquiry.inquiry_no] = inquiry

                    if status == "duplicate_item":
                        key_type, key, uncertain = _item_key(row)
                        existing_item = None if uncertain else existing_items.get(row.inquiry_no or "", {}).get((key_type, key))
                        item_updates = _fill_empty_item_fields(existing_item, row) if existing_item else {}
                        if item_updates and existing_item:
                            summary["updated_item_fields"] += len(item_updates)
                            await _log_in_session(
                                db,
                                user,
                                action_type="base_inquiry_import_item_field_fill_from_excel",
                                target_type="inquiry_item",
                                target_id=str(existing_item.id),
                                inquiry_id=inquiry.id,
                                inquiry_no=inquiry.inquiry_no,
                                description="基础询单导入补齐款式明细空字段",
                                after_data={
                                    "excel_file": file_name,
                                    "sheet": row.source_sheet,
                                    "row": row.row_number,
                                    "updated_fields": item_updates,
                                },
                            )
                            import_status = "updated_duplicate_item"
                        else:
                            summary["duplicate_items_skipped"] += 1
                            import_status = "skipped_duplicate_item"
                        if not row.customer_code:
                            summary["customer_unmatched_rows"] += 1
                        skip_item = True
                    else:
                        skip_item = False

                    if not skip_item:
                        key_type, key, uncertain = _item_key(row)
                        if uncertain:
                            summary["uncertain_item_rows"] += 1
                        else:
                            current_keys = created_item_keys.setdefault(row.inquiry_no or "", set())
                            if (key_type, key) in current_keys:
                                summary["duplicate_items_skipped"] += 1
                                import_status = "skipped_duplicate_item"
                                skip_item = True
                            else:
                                current_keys.add((key_type, key))
                    else:
                        key_type, key, uncertain = _item_key(row)

                    if not skip_item:
                        item = InquiryItem(
                            inquiry_id=inquiry.id,
                            inquiry_no=inquiry.inquiry_no,
                            product_name=row.product_name,
                            product_category=row.product_category,
                            series_name=row.series_name,
                            fabric_quality=row.fabric_quality,
                            color_print=row.color_print,
                            size_range=row.size_range,
                            quantity=row.quantity,
                            style_no=row.style_no,
                            order_status=row.order_status,
                            remark=f"来源：{row.source_sheet}!{row.row_number}",
                            extra_data={
                                "source_file": file_name,
                                "source_sheet": row.source_sheet,
                                "source_row": row.row_number,
                                "item_identity_key": row_data.get("item_identity_key"),
                                "item_identity_uncertain": uncertain,
                            },
                        )
                        db.add(item)
                        await db.flush()
                        summary["created_items"] += 1
                        if not row.customer_code:
                            summary["customer_unmatched_rows"] += 1
                            await _log_in_session(
                                db,
                                user,
                                action_type="base_inquiry_customer_unmatched",
                                target_type="inquiry",
                                target_id=str(inquiry.id),
                                inquiry_id=inquiry.id,
                                inquiry_no=inquiry.inquiry_no,
                                description="基础询单导入时客户未匹配",
                                after_data={"excel_file": file_name, "sheet": row.source_sheet, "row": row.row_number},
                            )
                        await _log_in_session(
                            db,
                            user,
                            action_type="base_inquiry_item_create_from_excel",
                            target_type="inquiry_item",
                            target_id=str(item.id),
                            inquiry_id=inquiry.id,
                            inquiry_no=inquiry.inquiry_no,
                            description="从 Excel 创建询单款式明细",
                            after_data={**_row_payload(row), "item_identity_key": row_data.get("item_identity_key"), "excel_file": file_name},
                        )
                        import_status = "imported"
            except Exception as exc:
                summary["write_failed_rows"] += 1
                error_message = str(exc)
                import_status = "error"

        db.add(ImportRow(
            batch_id=batch.id,
            row_number=row.row_number,
            inquiry_no=row.inquiry_no,
            status=import_status,
            raw_data_json={"file_name": file_name, "sheet": row.source_sheet, "row_number": row.row_number},
            parsed_data_json=_row_payload(row),
            error_message=error_message,
        ))
        results.append({**row_data, "result_status": import_status, "error_message": error_message})

    created_series_by_sheet: dict[tuple[str, str | None], OrderSeries] = {}
    created_series: list[dict[str, Any]] = []
    customer_ids: dict[str, uuid.UUID] = {}
    customer_codes = {inq.customer_code for inq in successful_inquiries.values() if inq.customer_code}
    if customer_codes:
        customer_rows = (await db.execute(select(Customer).where(Customer.customer_code.in_(customer_codes)))).scalars().all()
        customer_ids = {c.customer_code: c.id for c in customer_rows}

    for series_candidate in preview.get("document_series", []):
        source_sheet = series_candidate["source_sheet"]
        series_inquiry_nos = series_candidate["inquiry_nos"]
        series_inquiries = [successful_inquiries[no] for no in series_inquiry_nos if no in successful_inquiries]
        if len(series_inquiries) < 2:
            continue
        series_status = "active" if len(series_inquiries) == len(series_inquiry_nos) else "partial"
        if series_status == "partial":
            summary["partial_order_series"] += 1
        source_rows = [r["row_number"] for r in preview["rows"] if r["source_sheet"] == source_sheet and r["inquiry_no"] in {inq.inquiry_no for inq in series_inquiries}]
        customer_code = next((inq.customer_code for inq in series_inquiries if inq.customer_code), None)
        series_name = series_candidate.get("series_name")
        order_series = OrderSeries(
            series_code=f"OS-{datetime.utcnow():%Y%m%d}-{str(batch.id)[:8]}-{source_sheet}-{min(source_rows) if source_rows else 0}",
            series_name=series_name,
            source_file_name=file_name,
            source_sheet=source_sheet,
            source_start_row=min(source_rows) if source_rows else None,
            source_end_row=max(source_rows) if source_rows else None,
            customer_code=customer_code,
            customer_id=customer_ids.get(customer_code or ""),
            series_status=series_status,
            created_by=getattr(user, "username", None),
            notes="识别依据：" + " + ".join(series_candidate.get("basis") or []),
        )
        db.add(order_series)
        await db.flush()

        existing_series_items = (await db.execute(
            select(OrderSeriesItem.inquiry_id).where(OrderSeriesItem.inquiry_id.in_([inq.id for inq in series_inquiries]))
        )).scalars().all()
        existing_series_ids = set(existing_series_items)
        added_count = 0
        for idx, inq in enumerate(series_inquiries, start=1):
            if inq.id in existing_series_ids:
                continue
            source_row = next((r["row_number"] for r in preview["rows"] if r["inquiry_no"] == inq.inquiry_no and r["source_sheet"] == source_sheet), None)
            db.add(OrderSeriesItem(
                order_series_id=order_series.id,
                inquiry_id=inq.id,
                inquiry_no=inq.inquiry_no,
                source_sheet=source_sheet,
                source_row=source_row,
                sort_order=idx,
                is_confirmed=True,
            ))
            added_count += 1
        if added_count < 2:
            await db.delete(order_series)
            continue
        summary["created_order_series"] += 1
        created_series_by_sheet[(source_sheet, series_name)] = order_series
        created_series.append({
            "id": str(order_series.id),
            "series_code": order_series.series_code,
            "series_name": order_series.series_name,
            "series_status": order_series.series_status,
            "inquiry_nos": [inq.inquiry_no for inq in series_inquiries if inq.id not in existing_series_ids],
        })

    if confirmed_order_group_keys is None:
        selected_group_keys = {
            candidate["key"]
            for candidate in preview.get("order_group_candidates", [])
            if candidate.get("default_confirmed")
        }
    else:
        selected_group_keys = set(confirmed_order_group_keys)
    created_groups: list[dict[str, Any]] = []
    if selected_group_keys:
        for candidate in preview.get("order_group_candidates", []):
            if candidate["key"] not in selected_group_keys:
                continue
            group_inquiries = [successful_inquiries[no] for no in candidate["inquiry_nos"] if no in successful_inquiries]
            if len(group_inquiries) < 2:
                continue
            group_status = "active" if len(group_inquiries) == len(candidate["inquiry_nos"]) else "partial"
            if group_status == "partial":
                summary["partial_order_groups"] += 1
            group_code = f"OG-{datetime.utcnow():%Y%m%d}-{str(batch.id)[:8]}-{candidate['source_start_row']}"
            customer_code = next((inq.customer_code for inq in group_inquiries if inq.customer_code), None)
            group_marker = candidate.get("group_marker")
            document_series_name = candidate.get("document_series_name")
            parent_series = created_series_by_sheet.get((candidate["source_sheet"], document_series_name))
            group_name_parts = [p for p in (document_series_name, group_marker) if p]
            order_group = OrderGroup(
                group_code=group_code,
                group_name=" / ".join(group_name_parts) or f"{candidate['source_sheet']} {candidate['source_start_row']}-{candidate['source_end_row']}",
                source_file_name=file_name,
                source_sheet=candidate["source_sheet"],
                source_start_row=candidate["source_start_row"],
                source_end_row=candidate["source_end_row"],
                order_series_id=parent_series.id if parent_series else None,
                customer_code=customer_code,
                customer_id=customer_ids.get(customer_code or ""),
                group_status=group_status,
                created_by=getattr(user, "username", None),
                notes="\n".join([
                    "识别依据：" + " + ".join(candidate.get("basis") or []),
                    f"所在报价单系列：{document_series_name or '—'}",
                    f"组标记：{group_marker or '—'}",
                ]),
            )
            db.add(order_group)
            await db.flush()

            existing_group_items = (await db.execute(
                select(OrderGroupItem.inquiry_id).where(OrderGroupItem.inquiry_id.in_([inq.id for inq in group_inquiries]))
            )).scalars().all()
            existing_ids = set(existing_group_items)
            added_count = 0
            for idx, inq in enumerate(group_inquiries, start=1):
                if inq.id in existing_ids:
                    continue
                source_row = next((r["row_number"] for r in preview["rows"] if r["inquiry_no"] == inq.inquiry_no), None)
                db.add(OrderGroupItem(
                    order_group_id=order_group.id,
                    inquiry_id=inq.id,
                    inquiry_no=inq.inquiry_no,
                    source_sheet=candidate["source_sheet"],
                    source_row=source_row,
                    sort_order=idx,
                    is_confirmed=True,
                ))
                added_count += 1
            if added_count < 2:
                await db.delete(order_group)
                continue
            summary["created_order_groups"] += 1
            created_groups.append({
                "id": str(order_group.id),
                "group_code": order_group.group_code,
                "group_status": order_group.group_status,
                "inquiry_nos": [inq.inquiry_no for inq in group_inquiries if inq.id not in existing_ids],
            })

    batch.success_rows = summary["created_items"]
    batch.failed_rows = summary["write_failed_rows"]
    batch.new_rows = summary["created_inquiries"]
    batch.existing_rows = summary["existing_inquiries"]
    batch.duplicate_rows = summary["duplicate_items_skipped"]
    batch.uncertain_rows = summary["uncertain_item_rows"]
    batch.validation_failed_rows = preview["summary"]["failed"]
    batch.write_failed_rows = summary["write_failed_rows"]
    batch.status = "success" if summary["write_failed_rows"] == 0 else "partial"

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="base_inquiry_import_confirm",
        target_type="import_batch",
        target_id=batch.id,
        description="确认基础询单 Excel 导入",
        after_data={"file_name": file_name, "summary": summary, "created_order_series": created_series, "created_order_groups": created_groups},
    )

    return {
        "file_name": file_name,
        "batch_id": str(batch.id),
        "summary": summary,
        "rows": results,
        "created_order_series": created_series,
        "created_order_groups": created_groups,
        "next_step": {
            "message": "基础询单创建完成。下一步请进入“来龙去脉表资料导入”，回填报价轮次、工厂报价和订单资料。",
            "path": "/inquiry-journey-import",
        },
    }
