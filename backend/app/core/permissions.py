"""
权限控制核心模块

认证方式：
  1. JWT Bearer Token (Authorization: Bearer <token>) — 正式认证
  2. X-Username header — 开发/兼容模式（仅当无 JWT 时使用）
  3. 默认 demo_admin — 无任何 header 时的开发回退

角色及数据范围：
  admin        → 全量数据
  group_leader → 仅自己 group_name 的数据
  sales        → 仅 responsible_sales 或 assisting_sales 匹配自身的数据
  viewer       → 仅自己 group_name 的数据（只读）
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Inquiry, User

DEFAULT_USERNAME = "demo_admin"


# ── 当前用户解析 ───────────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    解析当前用户，优先级：
    1. Authorization: Bearer <JWT>
    2. X-Username header（开发模式）
    3. 默认 demo_admin
    """
    from app.core.auth import decode_access_token

    username: str | None = None

    # 1. JWT Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="无效或过期的 Token，请重新登录")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token 格式错误")
    else:
        # 2. X-Username header (仅开发环境允许)
        from app.config import settings
        if settings.APP_ENV == "production":
            raise HTTPException(status_code=401, detail="请先登录")
        username = (request.headers.get("X-Username") or DEFAULT_USERNAME).strip()

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail=f"用户不存在：{username}")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已停用")
    if getattr(user, "is_pending", False):
        raise HTTPException(status_code=403, detail="账号待管理员审批，请联系管理员")
    return user


UserDep = Annotated[User, Depends(get_current_user)]


# ── 工具函数 ──────────────────────────────────────────────────────────────────

def _user_names(user: User) -> list[str]:
    """返回用于匹配 responsible_sales / assisting_sales 的所有名称。"""
    names: set[str] = {user.username}
    if user.display_name:
        names.add(user.display_name)
    return list(names)


# ── 数据范围过滤 ───────────────────────────────────────────────────────────────

def apply_inquiry_scope(query, user: User):
    """在 SELECT 查询上叠加当前用户的数据范围条件。"""
    if user.role == "admin":
        return query
    if user.role in ("group_leader", "viewer"):
        return query.where(Inquiry.group_name == user.group_name)
    if user.role == "sales":
        names = _user_names(user)
        conditions = []
        for name in names:
            conditions.append(Inquiry.responsible_sales == name)
            conditions.append(Inquiry.assisting_sales == name)
        return query.where(or_(*conditions))
    # 未知角色：返回空集
    return query.where(Inquiry.id.is_(None))


# ── 单条权限判断 ───────────────────────────────────────────────────────────────

def can_view_inquiry(inquiry: Inquiry, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role in ("group_leader", "viewer"):
        return inquiry.group_name == user.group_name
    if user.role == "sales":
        names = set(_user_names(user))
        return (
            inquiry.responsible_sales in names
            or (inquiry.assisting_sales or "") in names
        )
    return False


def can_edit_inquiry(inquiry: Inquiry, user: User) -> bool:
    """viewer 不可编辑；其他角色需在可见范围内。"""
    if user.role == "viewer":
        return False
    return can_view_inquiry(inquiry, user)


def can_delete_inquiry(user: User) -> bool:
    """只有 admin 可删除。"""
    return user.role == "admin"


def can_import(user: User) -> bool:
    """admin 和 group_leader 可导入。"""
    return user.role in ("admin", "group_leader")


# ── 导入行范围检查 ─────────────────────────────────────────────────────────────

def check_row_group_scope(row_group_name: str | None, user: User) -> str | None:
    """
    group_leader 导入时检查每行 group_name 是否属于自己小组。
    返回 None 表示通过；返回字符串表示错误原因。
    """
    if user.role == "admin":
        return None
    if user.role == "group_leader":
        if row_group_name and row_group_name != user.group_name:
            return f"无权限导入其他小组数据（{row_group_name}）"
        if not row_group_name:
            return None  # 空 group_name 由必填字段检查处理
    return None
