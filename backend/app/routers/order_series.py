from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models import OrderSeries, OrderSeriesItem
from app.services.operation_log_service import log_kwargs_from_user, safe_log
from app.services.order_series_service import get_order_series_detail, list_order_series, load_order_series_or_403

router = APIRouter(prefix="/order-series", tags=["order-series"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_series(db: DbDep, user: UserDep):
    return {"items": await list_order_series(db, user)}


@router.get("/{series_id}")
async def get_series(series_id: uuid.UUID, db: DbDep, user: UserDep):
    try:
        return await get_order_series_detail(db, series_id, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.post("/{series_id}/cancel")
async def cancel_series(series_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    if user.role == "viewer":
        raise HTTPException(status_code=403, detail="只读角色不能取消报价单系列")
    try:
        series, _items, _inquiries = await load_order_series_or_403(db, series_id, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    series.series_status = "cancelled"
    for item in (await db.execute(select(OrderSeriesItem).where(OrderSeriesItem.order_series_id == series_id))).scalars().all():
        await db.delete(item)
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="order_series_cancel",
        target_type="order_series",
        target_id=str(series.id),
        description=f"取消报价单系列 {series.series_code}",
        request=request,
    )
    return {"ok": True}
