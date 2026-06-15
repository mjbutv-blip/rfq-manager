"""
用户管理路由

GET  /users          — 获取活跃用户列表（所有角色可用，用于 UserSwitcher/下拉）
GET  /users/all      — 获取所有用户含待审批（仅 admin）
PATCH /users/{username} — 更新用户角色/小组/状态（仅 admin）
DELETE /users/{username} — 删除用户（仅 admin）
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

_VALID_ROLES = {"admin", "group_leader", "sales", "viewer"}


class UserOut(BaseModel):
    username: str
    display_name: str | None
    role: str
    group_name: str | None
    is_active: bool
    is_pending: bool

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    role: str | None = None
    group_name: str | None = None
    display_name: str | None = None
    is_active: bool | None = None
    is_pending: bool | None = None


# ── 获取活跃用户列表（给 UserSwitcher / 下拉选项用）─────────────────────────────

@router.get("", response_model=list[UserOut])
async def list_users(db: DbDep):
    result = await db.execute(
        select(User)
        .where(User.is_active == True, User.is_pending == False)  # noqa: E712
        .order_by(User.role, User.group_name, User.display_name)
    )
    return result.scalars().all()


# ── 管理员：获取所有用户（含待审批）─────────────────────────────────────────────

@router.get("/all", response_model=list[UserOut])
async def list_all_users(db: DbDep, user: UserDep):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可查看所有用户")
    result = await db.execute(
        select(User).order_by(User.is_pending.desc(), User.role, User.group_name, User.display_name)
    )
    return result.scalars().all()


# ── 管理员：更新用户 ───────────────────────────────────────────────────────────

@router.patch("/{username}", response_model=UserOut)
async def update_user(username: str, body: UserUpdate, db: DbDep, user: UserDep):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可修改用户")
    if username == user.username and body.role is not None and body.role != "admin":
        raise HTTPException(400, "不能降级自己的管理员权限")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"用户 '{username}' 不存在")

    if body.role is not None:
        if body.role not in _VALID_ROLES:
            raise HTTPException(400, f"无效角色：{body.role}")
        target.role = body.role
    if body.group_name is not None:
        target.group_name = body.group_name or None
    if body.display_name is not None:
        target.display_name = body.display_name or None
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.is_pending is not None:
        target.is_pending = body.is_pending

    await db.commit()
    await db.refresh(target)
    return target


# ── 管理员：删除用户 ───────────────────────────────────────────────────────────

@router.delete("/{username}", status_code=204)
async def delete_user(username: str, db: DbDep, user: UserDep):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可删除用户")
    if username == user.username:
        raise HTTPException(400, "不能删除自己的账号")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"用户 '{username}' 不存在")

    await db.delete(target)
    await db.commit()
