from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_edit_inquiry, can_view_inquiry
from app.database import get_db
from app.models import Inquiry, QuoteItem
from app.services.journey_service import quote_item_brief
from app.services.operation_log_service import log_kwargs_from_user, safe_log, snapshot

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(tags=["quote-items"])

EDITABLE_FIRST_ROUND_FIELDS = (
    "order_quantity",
    "calc_quantity",
    "batch_shipment_count",
    "port_misc_fee_cny",
    "test_fee_cny",
    "misc_fee_cny",
    "included_other_fee_cny",
    "pieces_per_card",
    "destination_port_count",
    "exchange_rate",
    "net_profit_pct",
    "commission_pct",
    "selected_factory",
    "selected_factory_price_cny",
    "final_quote_usd",
    "current_exchange_rate",
    "customer_target_price_usd",
)


class QuoteItemUpdate(BaseModel):
    order_quantity: int | None = Field(default=None, ge=0)
    calc_quantity: int | None = Field(default=None, ge=0)
    batch_shipment_count: Decimal | None = Field(default=None, ge=0)
    port_misc_fee_cny: Decimal | None = Field(default=None, ge=0)
    test_fee_cny: Decimal | None = Field(default=None, ge=0)
    misc_fee_cny: Decimal | None = Field(default=None, ge=0)
    included_other_fee_cny: Decimal | None = Field(default=None, ge=0)
    pieces_per_card: int | None = Field(default=None, ge=0)
    destination_port_count: int | None = Field(default=None, ge=0)
    exchange_rate: Decimal | None = Field(default=None, ge=0)
    net_profit_pct: Decimal | None = None
    commission_pct: Decimal | None = None
    selected_factory: str | None = None
    selected_factory_price_cny: Decimal | None = Field(default=None, ge=0)
    final_quote_usd: Decimal | None = Field(default=None, ge=0)
    current_exchange_rate: Decimal | None = Field(default=None, ge=0)
    customer_target_price_usd: Decimal | None = Field(default=None, ge=0)


def _clean_payload(body: QuoteItemUpdate) -> dict[str, Any]:
    data = body.model_dump(exclude_unset=True)
    if "selected_factory" in data and data["selected_factory"] is not None:
        data["selected_factory"] = data["selected_factory"].strip() or None
    return data


@router.patch("/quote-items/{quote_item_id}")
async def update_quote_item(
    quote_item_id: uuid.UUID,
    body: QuoteItemUpdate,
    db: DbDep,
    user: UserDep,
    request: Request,
):
    item = await db.get(QuoteItem, quote_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="报价参数不存在")
    if item.quote_round != 1 or item.quote_type != "domestic":
        raise HTTPException(status_code=422, detail="本接口仅支持第一轮国内报价参数")

    inq = await db.get(Inquiry, item.inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")
    if not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单报价参数")

    before = snapshot(item, EDITABLE_FIRST_ROUND_FIELDS)
    payload = _clean_payload(body)
    for key, value in payload.items():
        if key in EDITABLE_FIRST_ROUND_FIELDS:
            setattr(item, key, value)

    await db.commit()
    await db.refresh(item)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="quote_item_update",
        target_type="quote_item",
        target_id=str(item.id),
        inquiry_id=item.inquiry_id,
        inquiry_no=inq.inquiry_no,
        description="保存第一轮国内报价参数",
        before_data=before,
        after_data=snapshot(item, EDITABLE_FIRST_ROUND_FIELDS),
        request=request,
    )
    return quote_item_brief(item)


@router.post("/inquiries/{inquiry_id}/quote-items", status_code=201)
async def create_first_round_quote_item(
    inquiry_id: uuid.UUID,
    body: QuoteItemUpdate,
    db: DbDep,
    user: UserDep,
    request: Request,
):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")
    if not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单报价参数")

    existing = (await db.execute(
        select(QuoteItem).where(
            QuoteItem.inquiry_id == inquiry_id,
            QuoteItem.quote_type == "domestic",
            QuoteItem.quote_round == 1,
        )
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="第一轮国内报价参数已存在，请直接编辑")

    item = QuoteItem(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        quote_type="domestic",
        quote_round=1,
    )
    payload = _clean_payload(body)
    for key, value in payload.items():
        if key in EDITABLE_FIRST_ROUND_FIELDS:
            setattr(item, key, value)

    db.add(item)
    await db.commit()
    await db.refresh(item)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="quote_item_create",
        target_type="quote_item",
        target_id=str(item.id),
        inquiry_id=item.inquiry_id,
        inquiry_no=inq.inquiry_no,
        description="创建第一轮国内报价参数",
        after_data=snapshot(item, EDITABLE_FIRST_ROUND_FIELDS),
        request=request,
    )
    return quote_item_brief(item)
