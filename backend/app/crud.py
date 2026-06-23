"""
CRUD — 薄层封装，只做数据库读写，业务逻辑在 services/ 里。
"""

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, ImportBatch, ImportRow, Inquiry
from app.models.inquiry_item import InquiryItem
from app.schemas.inquiry import InquiryFilter


# ── ImportBatch ───────────────────────────────────────────────────────────────

async def create_import_batch(db: AsyncSession, data: dict[str, Any]) -> ImportBatch:
    batch = ImportBatch(**data)
    db.add(batch)
    await db.flush()
    return batch


async def update_import_batch(db: AsyncSession, batch_id: uuid.UUID, data: dict[str, Any]) -> None:
    await db.execute(update(ImportBatch).where(ImportBatch.id == batch_id).values(**data))


async def get_import_batch(db: AsyncSession, batch_id: uuid.UUID) -> ImportBatch | None:
    return await db.get(ImportBatch, batch_id)


async def list_import_batches(db: AsyncSession, limit: int = 20, offset: int = 0) -> list[ImportBatch]:
    result = await db.execute(
        select(ImportBatch).order_by(ImportBatch.uploaded_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


# ── ImportRow ─────────────────────────────────────────────────────────────────

async def bulk_create_import_rows(db: AsyncSession, rows: list[dict[str, Any]]) -> None:
    db.add_all([ImportRow(**r) for r in rows])
    await db.flush()


async def list_import_rows(
    db: AsyncSession,
    batch_id: uuid.UUID,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ImportRow]:
    q = select(ImportRow).where(ImportRow.batch_id == batch_id)
    if status:
        q = q.where(ImportRow.status == status)
    q = q.order_by(ImportRow.row_number).limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


# ── Customer ──────────────────────────────────────────────────────────────────

async def get_customer_by_code(db: AsyncSession, code: str) -> Customer | None:
    result = await db.execute(select(Customer).where(Customer.customer_code == code))
    return result.scalar_one_or_none()


async def upsert_customer(db: AsyncSession, data: dict[str, Any]) -> Customer:
    """按 customer_code upsert，返回 customer 对象。"""
    existing = await get_customer_by_code(db, data["customer_code"])
    if existing:
        for k, v in data.items():
            if k != "customer_code" and v is not None:
                setattr(existing, k, v)
        await db.flush()
        return existing
    customer = Customer(**data)
    db.add(customer)
    await db.flush()
    return customer


# ── Inquiry ───────────────────────────────────────────────────────────────────

async def get_inquiry_by_no(db: AsyncSession, inquiry_no: str) -> Inquiry | None:
    result = await db.execute(select(Inquiry).where(Inquiry.inquiry_no == inquiry_no))
    return result.scalar_one_or_none()


async def create_inquiry(db: AsyncSession, data: dict[str, Any]) -> Inquiry:
    inq = Inquiry(**data)
    db.add(inq)
    await db.flush()
    return inq


# ── InquiryItem ───────────────────────────────────────────────────────────────

async def create_inquiry_item(
    db: AsyncSession, inquiry_id: uuid.UUID, inquiry_no: str | None, data: dict[str, Any]
) -> InquiryItem:
    item = InquiryItem(inquiry_id=inquiry_id, inquiry_no=inquiry_no, **data)
    db.add(item)
    await db.flush()
    return item


async def get_inquiry_item(db: AsyncSession, item_id: uuid.UUID) -> InquiryItem | None:
    return await db.get(InquiryItem, item_id)


async def list_inquiry_items(db: AsyncSession, inquiry_id: uuid.UUID) -> list[InquiryItem]:
    result = await db.execute(
        select(InquiryItem).where(InquiryItem.inquiry_id == inquiry_id).order_by(InquiryItem.created_at)
    )
    return list(result.scalars().all())


_MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

async def update_inquiry(db: AsyncSession, inquiry_id: uuid.UUID, data: dict[str, Any]) -> Inquiry | None:
    # inquiry_date 变更时自动推导 inquiry_year / inquiry_month
    if "inquiry_date" in data and data["inquiry_date"] is not None:
        d = data["inquiry_date"]
        data.setdefault("inquiry_year", d.year)
        data.setdefault("inquiry_month", _MONTH_ABBR[d.month - 1])
    await db.execute(update(Inquiry).where(Inquiry.id == inquiry_id).values(**data))
    return await db.get(Inquiry, inquiry_id)


async def delete_inquiry(db: AsyncSession, inquiry_id: uuid.UUID) -> bool:
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        return False
    await db.delete(inq)
    await db.flush()
    return True


_SORT_COLUMNS = {
    "inquiry_date":  Inquiry.inquiry_date,
    "trade_amount":  Inquiry.trade_amount,
    "created_at":    Inquiry.created_at,
    "inquiry_no":    Inquiry.inquiry_no,
}


def _apply_inquiry_filters(q, f: InquiryFilter, scope_user=None):
    """
    将 InquiryFilter 条件叠加到 SQLAlchemy select() 对象上并返回。
    scope_user 不为 None 时先施加数据范围过滤。
    由 list_inquiries 和 export_inquiries 共享。
    """
    if scope_user is not None:
        from app.core.permissions import apply_inquiry_scope
        q = apply_inquiry_scope(q, scope_user)

    if f.inquiry_no:
        q = q.where(Inquiry.inquiry_no.ilike(f"%{f.inquiry_no}%"))
    if f.customer_code:
        q = q.where(Inquiry.customer_code == f.customer_code)
    if f.customer_short_name:
        q = q.where(Inquiry.customer_short_name.ilike(f"%{f.customer_short_name}%"))
    if f.group_name:
        q = q.where(Inquiry.group_name == f.group_name)
    if f.responsible_sales:
        q = q.where(Inquiry.responsible_sales == f.responsible_sales)
    if f.assisting_sales:
        q = q.where(Inquiry.assisting_sales == f.assisting_sales)
    if f.product_category:
        q = q.where(Inquiry.product_category == f.product_category)
    if f.product_name:
        q = q.where(Inquiry.product_name.ilike(f"%{f.product_name}%"))
    if f.series_name:
        q = q.where(Inquiry.series_name.ilike(f"%{f.series_name}%"))
    if f.quote_status:
        q = q.where(Inquiry.quote_status == f.quote_status)
    if f.order_status:
        q = q.where(Inquiry.order_status == f.order_status)
    if f.season:
        q = q.where(Inquiry.season == f.season)
    if f.year:
        q = q.where(Inquiry.inquiry_year == f.year)
    if f.month:
        q = q.where(Inquiry.inquiry_month == f.month)
    if f.start_date:
        q = q.where(Inquiry.inquiry_date >= f.start_date)
    if f.end_date:
        q = q.where(Inquiry.inquiry_date <= f.end_date)
    return q


async def list_inquiries(
    db: AsyncSession,
    f: InquiryFilter,
    scope_user=None,
) -> tuple[list[Inquiry], int]:
    q = _apply_inquiry_filters(select(Inquiry), f, scope_user)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    sort_col = _SORT_COLUMNS.get(f.sort_by or "", Inquiry.inquiry_no)
    order_expr = sort_col.asc() if f.sort_order == "asc" else sort_col.desc()
    data_q = q.order_by(order_expr).limit(f.page_size).offset((f.page - 1) * f.page_size)
    rows = list((await db.execute(data_q)).scalars().all())
    return rows, total


async def export_inquiries(
    db: AsyncSession,
    f: InquiryFilter,
    scope_user=None,
) -> list[Inquiry]:
    """返回符合条件的全部询单（不分页）。权限范围与 list_inquiries 完全一致。"""
    q = _apply_inquiry_filters(select(Inquiry), f, scope_user)
    sort_col = _SORT_COLUMNS.get(f.sort_by or "", Inquiry.inquiry_no)
    order_expr = sort_col.asc() if f.sort_order == "asc" else sort_col.desc()
    rows = list((await db.execute(q.order_by(order_expr))).scalars().all())
    return rows
