"""
询单工厂价格录入（纵向报价卡片）

核心原则：一张卡片 = 一个询单 + 一轮报价 + 一家工厂 + 一个工厂价格 + 备注。
同一询单多家工厂/多轮报价时新增卡片向下排列，不会横向增加"工厂A价格/工厂B价格"列。

复用已有的 factory_quote_records 表，不重新建表——用 quote_round 字段区分：
  quote_round 为空  → 旧的"一次成交快照"行（Excel 导入 / 工厂详情页旧表单产生）
  quote_round 非空 → 本功能新增的"按轮次填报"卡片
两者共享同一张表但语义不同，factory_service.py 里的工厂统计聚合已经按
quote_round IS NULL 过滤，不会被这里的多轮议价记录拉偏均价。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, apply_inquiry_scope, can_edit_inquiry, can_view_inquiry
from app.database import get_db
from app.models.factory import Factory
from app.models.factory_quote_record import FactoryQuoteRecord
from app.models.inquiry import Inquiry
from app.services.operation_log_service import log_kwargs_from_user, safe_log

DbDep = Annotated[AsyncSession, Depends(get_db)]

router = APIRouter(tags=["factory-quotes"])

DEFAULT_CURRENCY = "USD"
DEFAULT_PRICE_UNIT = "件"


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FactoryQuoteCreate(BaseModel):
    factory_id: uuid.UUID | None = None
    factory_name: str | None = None
    quote_round: int | None = Field(None, ge=1)
    factory_price: Decimal = Field(..., ge=0)
    currency: str = DEFAULT_CURRENCY
    price_unit: str = DEFAULT_PRICE_UNIT
    remark: str | None = None

    @model_validator(mode="after")
    def _check_factory(self):
        if not self.factory_id and not (self.factory_name or "").strip():
            raise ValueError("请选择工厂或填写工厂名称")
        return self


class FactoryQuoteUpdate(BaseModel):
    factory_id: uuid.UUID | None = None
    factory_name: str | None = None
    quote_round: int | None = Field(None, ge=1)
    factory_price: Decimal | None = Field(None, ge=0)
    currency: str | None = None
    price_unit: str | None = None
    remark: str | None = None


def _snapshot(r: FactoryQuoteRecord) -> dict[str, Any]:
    return {
        "factory_name": r.factory_name,
        "quote_round": r.quote_round,
        "factory_price": float(r.factory_price) if r.factory_price is not None else None,
        "currency": r.currency,
        "price_unit": r.price_unit,
        "remark": r.remark,
    }


def _to_dict(r: FactoryQuoteRecord) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "inquiry_id": str(r.inquiry_id) if r.inquiry_id else None,
        "inquiry_no": r.inquiry_no,
        "factory_id": str(r.factory_id) if r.factory_id else None,
        "factory_name": r.factory_name,
        "has_factory_profile": r.factory_id is not None,
        "quote_round": r.quote_round,
        "factory_price": float(r.factory_price) if r.factory_price is not None else None,
        "currency": r.currency,
        "price_unit": r.price_unit,
        "remark": r.remark,
        "quoted_by": r.quoted_by,
        "quoted_at": r.quoted_at.isoformat() if r.quoted_at else None,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _sort_key(r: FactoryQuoteRecord):
    return (r.quote_round or 0, r.factory_name or "", r.created_at)


def _is_same_factory(a: FactoryQuoteRecord, factory_id: uuid.UUID | None, factory_name: str | None) -> bool:
    if a.factory_id and factory_id:
        return a.factory_id == factory_id
    if not a.factory_id and not factory_id:
        return (a.factory_name or "").strip() == (factory_name or "").strip()
    return False


def annotate_round_comparison(records: list[FactoryQuoteRecord]) -> dict[uuid.UUID, str | None]:
    """
    本轮最低价比较——只在"同一询单 + 同一轮次 + 币种相同 + 单位相同"时比较。
    返回 {record_id: "lowest" | "not_lowest" | "mismatch" | None}
    None 表示该轮次只有一张卡片，无需比较。
    """
    by_round: dict[int | None, list[FactoryQuoteRecord]] = {}
    for r in records:
        by_round.setdefault(r.quote_round, []).append(r)

    result: dict[uuid.UUID, str | None] = {}
    for round_no, cards in by_round.items():
        if round_no is None or len(cards) < 2:
            for c in cards:
                result[c.id] = None
            continue

        units = {(c.currency, c.price_unit) for c in cards}
        if len(units) > 1:
            for c in cards:
                result[c.id] = "mismatch"
            continue

        prices = [c.factory_price for c in cards if c.factory_price is not None]
        if not prices:
            for c in cards:
                result[c.id] = None
            continue
        min_price = min(prices)
        for c in cards:
            result[c.id] = "lowest" if c.factory_price == min_price else "not_lowest"

    return result


async def _resolve_factory(db: AsyncSession, factory_id: uuid.UUID | None, factory_name: str | None) -> tuple[uuid.UUID | None, str | None]:
    """
    优先用 factory_id；只给了 factory_name 时尝试按名称匹配已有工厂档案（精确匹配，
    方便用户用同一个工厂名称时自动关联），匹配不到就只存 factory_name，不自动建档案。
    """
    if factory_id:
        factory = await db.get(Factory, factory_id)
        if not factory:
            raise HTTPException(status_code=404, detail="工厂不存在")
        return factory.id, (factory.factory_short_name or factory.factory_name)

    name = (factory_name or "").strip()
    existing = (await db.execute(
        select(Factory).where((Factory.factory_name == name) | (Factory.factory_short_name == name))
    )).scalars().first()
    if existing:
        return existing.id, (existing.factory_short_name or existing.factory_name)
    return None, name


async def _check_duplicate_round(
    db: AsyncSession, inquiry_id: uuid.UUID, quote_round: int,
    factory_id: uuid.UUID | None, factory_name: str | None,
    exclude_id: uuid.UUID | None = None,
) -> None:
    q = select(FactoryQuoteRecord).where(
        FactoryQuoteRecord.inquiry_id == inquiry_id,
        FactoryQuoteRecord.quote_round == quote_round,
    )
    rows = (await db.execute(q)).scalars().all()
    for r in rows:
        if exclude_id and r.id == exclude_id:
            continue
        if _is_same_factory(r, factory_id, factory_name):
            raise HTTPException(
                status_code=409,
                detail=f"第 {quote_round} 轮已有「{r.factory_name}」的报价，请编辑该卡片，不要新增重复记录",
            )


# ── 询单维度：列表 + 新增 ──────────────────────────────────────────────────────

@router.get("/inquiries/{inquiry_id}/factory-quotes")
async def list_inquiry_factory_quotes(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")

    rows = (await db.execute(
        select(FactoryQuoteRecord).where(
            FactoryQuoteRecord.inquiry_id == inquiry_id,
            FactoryQuoteRecord.quote_round.isnot(None),
        )
    )).scalars().all()
    rows = sorted(rows, key=_sort_key)

    comparison = annotate_round_comparison(rows)
    items = []
    for r in rows:
        d = _to_dict(r)
        d["round_comparison"] = comparison.get(r.id)
        items.append(d)
    return {"items": items, "can_edit": can_edit_inquiry(inq, user)}


@router.post("/inquiries/{inquiry_id}/factory-quotes", status_code=201)
async def create_inquiry_factory_quote(
    inquiry_id: uuid.UUID, body: FactoryQuoteCreate, db: DbDep, user: UserDep, request: Request,
):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单的工厂报价")

    factory_id, factory_name = await _resolve_factory(db, body.factory_id, body.factory_name)

    quote_round = body.quote_round
    if quote_round is None:
        max_round = (await db.execute(
            select(FactoryQuoteRecord.quote_round).where(
                FactoryQuoteRecord.inquiry_id == inquiry_id,
                FactoryQuoteRecord.quote_round.isnot(None),
            )
        )).scalars().all()
        quote_round = (max(max_round) if max_round else 0) + 1

    await _check_duplicate_round(db, inquiry_id, quote_round, factory_id, factory_name)

    record = FactoryQuoteRecord(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        inquiry_no=inq.inquiry_no,
        factory_id=factory_id,
        factory_name=factory_name,
        quote_round=quote_round,
        factory_price=body.factory_price,
        currency=body.currency or DEFAULT_CURRENCY,
        price_unit=body.price_unit or DEFAULT_PRICE_UNIT,
        remark=body.remark,
        quoted_by=user.username,
        quoted_at=datetime.now(timezone.utc),
        created_by=user.username,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_create",
        target_type="factory_quote",
        target_id=str(record.id),
        inquiry_id=inquiry_id,
        inquiry_no=inq.inquiry_no,
        description=f"新增工厂报价：第{quote_round}轮 / {factory_name} / {body.factory_price} {record.currency}/{record.price_unit}",
        after_data=_snapshot(record),
        request=request,
    )

    d = _to_dict(record)
    d["round_comparison"] = None
    return d


# ── 单条记录：编辑 / 删除 ──────────────────────────────────────────────────────

async def _load_quote_or_404(db: AsyncSession, quote_id: uuid.UUID) -> FactoryQuoteRecord:
    record = await db.get(FactoryQuoteRecord, quote_id)
    if not record or record.quote_round is None:
        raise HTTPException(status_code=404, detail="工厂报价不存在")
    return record


@router.patch("/factory-quotes/{quote_id}")
async def update_factory_quote(quote_id: uuid.UUID, body: FactoryQuoteUpdate, db: DbDep, user: UserDep, request: Request):
    record = await _load_quote_or_404(db, quote_id)
    inq = await db.get(Inquiry, record.inquiry_id) if record.inquiry_id else None
    if inq and not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单的工厂报价")
    if not inq and user.role == "viewer":
        raise HTTPException(status_code=403, detail="无权编辑该工厂报价")

    before = _snapshot(record)
    data = body.model_dump(exclude_unset=True)

    factory_id, factory_name = record.factory_id, record.factory_name
    if "factory_id" in data or "factory_name" in data:
        factory_id, factory_name = await _resolve_factory(
            db, data.pop("factory_id", None), data.pop("factory_name", None) or record.factory_name,
        )
    data.pop("factory_id", None)
    data.pop("factory_name", None)

    quote_round = data.pop("quote_round", record.quote_round)

    if record.inquiry_id and (quote_round != record.quote_round or factory_id != record.factory_id or factory_name != record.factory_name):
        await _check_duplicate_round(db, record.inquiry_id, quote_round, factory_id, factory_name, exclude_id=record.id)

    record.factory_id = factory_id
    record.factory_name = factory_name
    record.quote_round = quote_round
    for k, v in data.items():
        setattr(record, k, v)

    await db.commit()
    await db.refresh(record)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_update",
        target_type="factory_quote",
        target_id=str(record.id),
        inquiry_id=record.inquiry_id,
        inquiry_no=record.inquiry_no,
        description=f"编辑工厂报价：第{record.quote_round}轮 / {record.factory_name}",
        before_data=before,
        after_data=_snapshot(record),
        request=request,
    )

    comparison = None
    if record.inquiry_id:
        rows = (await db.execute(
            select(FactoryQuoteRecord).where(
                FactoryQuoteRecord.inquiry_id == record.inquiry_id,
                FactoryQuoteRecord.quote_round.isnot(None),
            )
        )).scalars().all()
        comparison = annotate_round_comparison(rows).get(record.id)

    d = _to_dict(record)
    d["round_comparison"] = comparison
    return d


@router.delete("/factory-quotes/{quote_id}", status_code=204)
async def delete_factory_quote(quote_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    record = await _load_quote_or_404(db, quote_id)
    inq = await db.get(Inquiry, record.inquiry_id) if record.inquiry_id else None
    if inq and not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权删除该询单的工厂报价")
    if not inq and user.role == "viewer":
        raise HTTPException(status_code=403, detail="无权删除该工厂报价")

    before = _snapshot(record)
    inquiry_id = record.inquiry_id
    inquiry_no = record.inquiry_no

    await db.delete(record)
    await db.commit()

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="factory_quote_delete",
        target_type="factory_quote",
        target_id=str(quote_id),
        inquiry_id=inquiry_id,
        inquiry_no=inquiry_no,
        description=f"删除工厂报价：第{before['quote_round']}轮 / {before['factory_name']}",
        before_data=before,
        request=request,
    )


# ── 全局列表（独立录入页面备用）────────────────────────────────────────────────

@router.get("/factory-quotes")
async def list_factory_quotes(
    db: DbDep, user: UserDep,
    inquiry_no: str | None = Query(None),
    factory_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = (
        select(FactoryQuoteRecord)
        .join(Inquiry, FactoryQuoteRecord.inquiry_id == Inquiry.id)
        .where(FactoryQuoteRecord.quote_round.isnot(None))
    )
    q = apply_inquiry_scope(q, user)
    if inquiry_no:
        q = q.where(FactoryQuoteRecord.inquiry_no.ilike(f"%{inquiry_no}%"))
    if factory_name:
        q = q.where(FactoryQuoteRecord.factory_name.ilike(f"%{factory_name}%"))

    rows = (await db.execute(q)).scalars().all()
    rows = sorted(rows, key=lambda r: r.created_at, reverse=True)
    total = len(rows)
    page_rows = rows[(page - 1) * page_size: page * page_size]

    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [_to_dict(r) for r in page_rows],
    }
