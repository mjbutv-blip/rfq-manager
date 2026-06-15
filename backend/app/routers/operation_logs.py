import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models import Inquiry
from app.models.operation_log import OperationLog

router = APIRouter(prefix="/operation-logs", tags=["operation-logs"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


# ── Schema ────────────────────────────────────────────────────────────────────

class OperationLogOut(BaseModel):
    id: uuid.UUID
    actor_username: str
    actor_display_name: str | None
    actor_role: str | None
    action_type: str
    target_type: str | None
    target_id: str | None
    inquiry_id: uuid.UUID | None
    inquiry_no: str | None
    description: str | None
    before_data_json: dict | None
    after_data_json: dict | None
    request_path: str | None
    request_method: str | None
    ip_address: str | None
    status: str
    error_message: str | None
    created_at: str  # ISO string

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, obj: OperationLog) -> "OperationLogOut":
        return cls(
            id=obj.id,
            actor_username=obj.actor_username,
            actor_display_name=obj.actor_display_name,
            actor_role=obj.actor_role,
            action_type=obj.action_type,
            target_type=obj.target_type,
            target_id=obj.target_id,
            inquiry_id=obj.inquiry_id,
            inquiry_no=obj.inquiry_no,
            description=obj.description,
            before_data_json=obj.before_data_json,
            after_data_json=obj.after_data_json,
            request_path=obj.request_path,
            request_method=obj.request_method,
            ip_address=obj.ip_address,
            status=obj.status,
            error_message=obj.error_message,
            created_at=obj.created_at.isoformat() if obj.created_at else "",
        )


# ── 权限辅助 ──────────────────────────────────────────────────────────────────

def _apply_user_scope(q, user):
    """根据角色限定可见日志范围。"""
    if user.role == "admin":
        return q

    if user.role == "group_leader":
        # 本组询单的日志 OR 自己操作的无询单日志
        group_inq = select(Inquiry.id).where(Inquiry.group_name == user.group_name)
        return q.where(
            or_(
                OperationLog.inquiry_id.in_(group_inq),
                and_(
                    OperationLog.inquiry_id.is_(None),
                    OperationLog.actor_username == user.username,
                ),
            )
        )

    if user.role == "sales":
        names = [user.username]
        if user.display_name:
            names.append(user.display_name)
        sales_inq = select(Inquiry.id).where(
            or_(
                Inquiry.responsible_sales.in_(names),
                Inquiry.assisting_sales.in_(names),
            )
        )
        return q.where(
            or_(
                OperationLog.inquiry_id.in_(sales_inq),
                OperationLog.actor_username.in_(names),
            )
        )

    # viewer 或未知角色：只看自己操作的
    return q.where(OperationLog.actor_username == user.username)


# ── 列表查询 ──────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_logs(
    db: DbDep,
    user: UserDep,
    actor_username: str | None = Query(None),
    action_type:    str | None = Query(None),
    target_type:    str | None = Query(None),
    inquiry_no:     str | None = Query(None),
    status:         str | None = Query(None),
    start_date:     date | None = Query(None),
    end_date:       date | None = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = select(OperationLog)
    q = _apply_user_scope(q, user)

    if actor_username:
        q = q.where(OperationLog.actor_username.ilike(f"%{actor_username}%"))
    if action_type:
        q = q.where(OperationLog.action_type == action_type)
    if target_type:
        q = q.where(OperationLog.target_type == target_type)
    if inquiry_no:
        q = q.where(OperationLog.inquiry_no.ilike(f"%{inquiry_no}%"))
    if status:
        q = q.where(OperationLog.status == status)
    if start_date:
        q = q.where(OperationLog.created_at >= start_date)
    if end_date:
        from datetime import timedelta
        q = q.where(OperationLog.created_at < end_date + timedelta(days=1))

    # count
    from sqlalchemy import func
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    q = q.order_by(OperationLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(q)).scalars().all())

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [OperationLogOut.from_orm(r).model_dump() for r in rows],
    }
