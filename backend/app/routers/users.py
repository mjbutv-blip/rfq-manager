"""
用户管理路由

GET  /users                        — 活跃用户列表（所有角色，用于下拉）
GET  /users/all                    — 所有用户含待审批（仅 admin）
POST /users                        — 创建用户（仅 admin）
PATCH /users/{username}            — 更新用户（仅 admin）
POST /users/{username}/reset-password — 重置密码（仅 admin）
DELETE /users/{username}           — 删除用户（仅 admin）
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_password
from app.core.permissions import UserDep
from app.database import get_db
from app.models.operation_log import OperationLog
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

_VALID_ROLES = {"admin", "group_leader", "sales", "viewer"}


# ── Pydantic 模型 ──────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    username: str
    display_name: str | None
    role: str
    group_name: str | None
    is_active: bool
    is_pending: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    role: str = "sales"
    group_name: str | None = None
    email: str | None = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("用户名至少 2 个字符")
        if len(v) > 32:
            raise ValueError("用户名不超过 32 个字符")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少 6 个字符")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in _VALID_ROLES:
            raise ValueError(f"无效角色：{v}")
        return v


class UserUpdate(BaseModel):
    role: str | None = None
    group_name: str | None = None
    display_name: str | None = None
    is_active: bool | None = None
    is_pending: bool | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pw_len(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少 6 个字符")
        return v


# ── 辅助：写操作日志 ───────────────────────────────────────────────────────────

async def _log(
    db: AsyncSession,
    actor: User,
    action_type: str,
    description: str,
    target_id: str | None = None,
    request: Request | None = None,
) -> None:
    db.add(OperationLog(
        id=uuid.uuid4(),
        actor_username=actor.username,
        actor_display_name=actor.display_name,
        actor_role=actor.role,
        action_type=action_type,
        target_type="user",
        target_id=target_id,
        description=description,
        status="success",
        request_path=str(request.url.path) if request else None,
        request_method=request.method if request else None,
        ip_address=request.client.host if request and request.client else None,
    ))


# ── 活跃用户列表（给下拉选项用）─────────────────────────────────────────────────

@router.get("", response_model=list[UserOut])
async def list_users(db: DbDep):
    result = await db.execute(
        select(User)
        .where(User.is_active == True, User.is_pending == False)  # noqa: E712
        .order_by(User.role, User.group_name, User.display_name)
    )
    return result.scalars().all()


# ── 管理员：所有用户（含待审批）─────────────────────────────────────────────────

@router.get("/all", response_model=list[UserOut])
async def list_all_users(db: DbDep, user: UserDep):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可查看所有用户")
    result = await db.execute(
        select(User).order_by(User.is_pending.desc(), User.role, User.group_name, User.display_name)
    )
    return result.scalars().all()


# ── 管理员：创建用户 ───────────────────────────────────────────────────────────

@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可创建用户")

    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(409, f"用户名 '{body.username}' 已被使用")

    new_user = User(
        id=uuid.uuid4(),
        username=body.username,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        group_name=body.group_name,
        email=body.email,
        is_active=True,
        is_pending=False,
    )
    db.add(new_user)
    await _log(db, user, "user_create",
               f"创建用户 {body.username}（{body.display_name}），角色：{body.role}",
               body.username, request)
    await db.commit()
    await db.refresh(new_user)
    return new_user


# ── 管理员：更新用户 ───────────────────────────────────────────────────────────

@router.patch("/{username}", response_model=UserOut)
async def update_user(username: str, body: UserUpdate, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可修改用户")
    if username == user.username and body.role is not None and body.role != "admin":
        raise HTTPException(400, "不能降级自己的管理员权限")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"用户 '{username}' 不存在")

    changes: list[str] = []
    if body.role is not None:
        if body.role not in _VALID_ROLES:
            raise HTTPException(400, f"无效角色：{body.role}")
        if target.role != body.role:
            changes.append(f"角色 {target.role}→{body.role}")
        target.role = body.role
    if body.group_name is not None:
        target.group_name = body.group_name or None
    if body.display_name is not None:
        target.display_name = body.display_name or None
    if body.is_active is not None:
        if target.is_active != body.is_active:
            changes.append("停用" if not body.is_active else "启用")
        target.is_active = body.is_active
    if body.is_pending is not None:
        if target.is_pending and not body.is_pending:
            changes.append("审批通过")
        target.is_pending = body.is_pending

    desc = f"更新用户 {username}：" + ("、".join(changes) if changes else "无变更")
    await _log(db, user, "user_update", desc, username, request)
    await db.commit()
    await db.refresh(target)
    return target


# ── 管理员：重置密码 ───────────────────────────────────────────────────────────

@router.post("/{username}/reset-password", response_model=dict)
async def reset_password(username: str, body: ResetPasswordRequest, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可重置密码")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"用户 '{username}' 不存在")

    target.hashed_password = hash_password(body.new_password)
    await _log(db, user, "user_password_reset",
               f"重置用户 {username} 的密码", username, request)
    await db.commit()
    return {"message": f"用户 {username} 密码已重置"}


# ── 管理员：删除用户 ───────────────────────────────────────────────────────────

@router.delete("/{username}", status_code=204)
async def delete_user(username: str, db: DbDep, user: UserDep, request: Request):
    if user.role != "admin":
        raise HTTPException(403, "仅管理员可删除用户")
    if username == user.username:
        raise HTTPException(400, "不能删除自己的账号")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"用户 '{username}' 不存在")

    await _log(db, user, "user_update",
               f"删除用户 {username}（{target.display_name}）", username, request)
    await db.delete(target)
    await db.commit()
