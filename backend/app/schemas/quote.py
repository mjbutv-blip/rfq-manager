import uuid
from datetime import date, datetime

from pydantic import BaseModel


class QuoteItemBase(BaseModel):
    inquiry_id: uuid.UUID
    quote_round: int = 1
    order_quantity: int | None = None
    calc_quantity: int | None = None
    port_misc_fee_cny: float | None = None
    exchange_rate: float | None = None
    factory1_name: str | None = None
    factory1_price_cny: float | None = None
    factory2_name: str | None = None
    factory2_price_cny: float | None = None
    factory3_name: str | None = None
    factory3_price_cny: float | None = None
    lowest_factory: str | None = None
    lowest_price_cny: float | None = None
    second_lowest_factory: str | None = None
    second_lowest_price_cny: float | None = None
    net_profit_pct: float | None = None
    commission_pct: float | None = None
    selected_factory: str | None = None
    selected_factory_price_cny: float | None = None
    final_quote_usd: float | None = None
    customer_target_price_usd: float | None = None
    quote_vs_target_ratio: float | None = None
    target_gap_cny: float | None = None
    reverse_target_price_cny: float | None = None
    gross_profit_cny: float | None = None
    gross_profit_pct: float | None = None
    order_status: str | None = None
    current_exchange_rate: float | None = None
    trade_amount_usd: float | None = None
    quote_date: date | None = None
    quote_situation: str | None = None
    material_received_date: date | None = None
    factory_arranged_date: date | None = None
    client_quoted_date: date | None = None
    archive_email_done: bool = False
    price_tracking_notes: str | None = None
    notes: str | None = None


class QuoteItemCreate(QuoteItemBase):
    pass


class QuoteItemUpdate(BaseModel):
    selected_factory: str | None = None
    selected_factory_price_cny: float | None = None
    final_quote_usd: float | None = None
    customer_target_price_usd: float | None = None
    gross_profit_cny: float | None = None
    gross_profit_pct: float | None = None
    order_status: str | None = None
    quote_date: date | None = None
    quote_situation: str | None = None
    material_received_date: date | None = None
    factory_arranged_date: date | None = None
    client_quoted_date: date | None = None
    archive_email_done: bool | None = None
    price_tracking_notes: str | None = None
    notes: str | None = None


class QuoteItemOut(QuoteItemBase):
    id: uuid.UUID
    import_batch_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
