from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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

EDITABLE_QUOTE_ITEM_FIELDS = (
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
EDITABLE_FIRST_ROUND_FIELDS = EDITABLE_QUOTE_ITEM_FIELDS


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


def _num(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _apply_quote_calculations(item: QuoteItem) -> None:
    qty = item.order_quantity or item.calc_quantity
    final_quote = _num(item.final_quote_usd)
    target = _num(item.customer_target_price_usd)
    factory_price = _num(item.selected_factory_price_cny)
    exchange_rate = _num(item.current_exchange_rate) or _num(item.exchange_rate)
    port_misc = _num(item.port_misc_fee_cny) or Decimal("0")
    test_fee = _num(item.test_fee_cny) or Decimal("0")
    misc_fee = _num(item.misc_fee_cny) or Decimal("0")
    commission_pct = (_num(item.commission_pct) or Decimal("0")) / Decimal("100")
    net_profit_pct = (_num(item.net_profit_pct) or Decimal("0")) / Decimal("100")

    if qty and final_quote is not None:
        item.trade_amount_usd = final_quote * Decimal(qty)
    else:
        item.trade_amount_usd = None

    if item.trade_amount_usd is not None and exchange_rate is not None and factory_price is not None and qty:
        sales_cny = _num(item.trade_amount_usd) * exchange_rate
        cost_cny = (factory_price + port_misc + test_fee + misc_fee) * Decimal(qty)
        commission_cny = sales_cny * commission_pct
        item.gross_profit_cny = sales_cny - cost_cny - commission_cny
        item.gross_profit_pct = (item.gross_profit_cny / sales_cny * Decimal("100")) if sales_cny else None
    else:
        item.gross_profit_cny = None
        item.gross_profit_pct = None

    if target is not None and final_quote is not None:
        item.quote_vs_target_ratio = final_quote / target if target else None
        item.target_price_gap_usd = target - final_quote
    else:
        item.quote_vs_target_ratio = None
        item.target_price_gap_usd = None

    if target is not None and qty:
        item.target_trade_amount_usd = target * Decimal(qty)
    else:
        item.target_trade_amount_usd = None

    if item.target_trade_amount_usd is not None and exchange_rate is not None and factory_price is not None and qty:
        target_sales_cny = _num(item.target_trade_amount_usd) * exchange_rate
        target_cost_cny = (factory_price + port_misc + test_fee + misc_fee) * Decimal(qty)
        target_commission_cny = target_sales_cny * commission_pct
        item.target_gross_profit_cny = target_sales_cny - target_cost_cny - target_commission_cny
        item.target_profit_value = item.target_gross_profit_cny
        desired_profit_cny = target_sales_cny * net_profit_pct
        item.reverse_target_profit_value = desired_profit_cny
        item.reverse_target_price_cny = (
            (target_sales_cny - target_commission_cny - desired_profit_cny) / Decimal(qty)
            - port_misc
            - test_fee
            - misc_fee
        )
    else:
        item.target_gross_profit_cny = None
        item.target_profit_value = None
        item.reverse_target_profit_value = None
        item.reverse_target_price_cny = None


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
    if item.quote_type != "domestic":
        raise HTTPException(status_code=422, detail="本接口仅支持国内报价参数")

    inq = await db.get(Inquiry, item.inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")
    if not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单报价参数")

    before = snapshot(item, EDITABLE_QUOTE_ITEM_FIELDS)
    payload = _clean_payload(body)
    for key, value in payload.items():
        if key in EDITABLE_QUOTE_ITEM_FIELDS:
            setattr(item, key, value)
    _apply_quote_calculations(item)

    await db.commit()
    await db.refresh(item)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="quote_item_update",
        target_type="quote_item",
        target_id=str(item.id),
        inquiry_id=item.inquiry_id,
        inquiry_no=inq.inquiry_no,
        description=f"保存第{item.quote_round}轮国内报价参数",
        before_data=before,
        after_data=snapshot(item, EDITABLE_QUOTE_ITEM_FIELDS),
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
    quote_round: int = Query(1, ge=1),
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
            QuoteItem.quote_round == quote_round,
        )
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail=f"第{quote_round}轮国内报价参数已存在，请直接编辑")

    item = QuoteItem(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        quote_type="domestic",
        quote_round=quote_round,
    )
    payload = _clean_payload(body)
    for key, value in payload.items():
        if key in EDITABLE_QUOTE_ITEM_FIELDS:
            setattr(item, key, value)
    _apply_quote_calculations(item)

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
        description=f"创建第{quote_round}轮国内报价参数",
        after_data=snapshot(item, EDITABLE_QUOTE_ITEM_FIELDS),
        request=request,
    )
    return quote_item_brief(item)
