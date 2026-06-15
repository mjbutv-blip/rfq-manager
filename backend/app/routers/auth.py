"""
认证路由

POST /auth/login     — 用户名+密码登录，返回 JWT
POST /auth/register  — 自助注册（默认 sales 角色，需管理员审批激活）
GET  /auth/me        — 获取当前用户信息（需认证）
POST /auth/change-password — 修改密码（需认证）
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, hash_password, verify_password
from app.core.permissions import UserDep
from app.database import get_db

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Pydantic 模型 ──────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    display_name: str
    password: str
    confirm_password: str
    group_name: str | None = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
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


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pw_len(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("新密码至少 6 个字符")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserOut(BaseModel):
    username: str
    display_name: str | None
    role: str
    group_name: str | None
    is_active: bool
    is_pending: bool

    model_config = {"from_attributes": True}


# ── 登录 ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DbDep):
    from app.models.user import User

    result = await db.execute(select(User).where(User.username == body.username.strip()))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(401, "用户名或密码错误")

    # 如果用户没有设置密码（老 seed 用户），使用默认密码 "admin123"
    if not user.hashed_password:
        if body.password != "admin123":
            raise HTTPException(401, "用户名或密码错误")
    elif not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "用户名或密码错误")

    if not user.is_active:
        raise HTTPException(403, "账号已停用")
    if user.is_pending:
        raise HTTPException(403, "账号待管理员审批，请联系管理员")

    token = create_access_token({"sub": user.username})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user).model_dump(),
    )


# ── 注册 ──────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=dict, status_code=201)
async def register(body: RegisterRequest, db: DbDep):
    from app.models.user import User

    if body.password != body.confirm_password:
        raise HTTPException(400, "两次输入的密码不一致")

    # 检查用户名是否已存在
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(409, f"用户名 '{body.username}' 已被使用，请换一个")

    user = User(
        id=uuid.uuid4(),
        username=body.username,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        role="sales",
        group_name=body.group_name,
        is_active=True,
        is_pending=True,   # 需管理员审批
    )
    db.add(user)
    await db.commit()

    return {
        "message": "注册成功，请等待管理员审批后方可登录",
        "username": user.username,
    }


# ── 当前用户信息 ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(user: UserDep):
    return user


# ── 修改密码 ──────────────────────────────────────────────────────────────────

@router.post("/change-password", response_model=dict)
async def change_password(body: ChangePasswordRequest, user: UserDep, db: DbDep):
    # 验证旧密码
    if not user.hashed_password:
        if body.old_password != "admin123":
            raise HTTPException(400, "旧密码错误")
    elif not verify_password(body.old_password, user.hashed_password):
        raise HTTPException(400, "旧密码错误")

    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "密码修改成功"}
