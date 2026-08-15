from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models import OrderGroup, OrderGroupItem
from app.services.operation_log_service import log_kwargs_from_user, safe_log
from app.services.order_group_service import get_combined_order_group_detail, get_order_group_detail, list_order_groups, load_order_group_or_403

router = APIRouter(prefix="/order-groups", tags=["order-groups"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_groups(db: DbDep, user: UserDep):
    return {"items": await list_order_groups(db, user)}


@router.get("/combined")
async def get_combined_groups(db: DbDep, user: UserDep, ids: list[uuid.UUID] = Query(...)):
    if len(ids) < 1:
        raise HTTPException(status_code=422, detail="至少选择一个订单组")
    try:
        return await get_combined_order_group_detail(db, ids, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get("/{group_id}")
async def get_group(group_id: uuid.UUID, db: DbDep, user: UserDep):
    try:
        return await get_order_group_detail(db, group_id, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.post("/{group_id}/cancel")
async def cancel_group(group_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    if user.role == "viewer":
        raise HTTPException(status_code=403, detail="只读角色不能取消订单组")
    try:
        group, _items, _inquiries = await load_order_group_or_403(db, group_id, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    group.group_status = "cancelled"
    for item in (await db.execute(select(OrderGroupItem).where(OrderGroupItem.order_group_id == group_id))).scalars().all():
        await db.delete(item)
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="order_group_cancel",
        target_type="order_group",
        target_id=str(group.id),
        description=f"取消订单组 {group.group_code}",
        request=request,
    )
    return {"ok": True}
