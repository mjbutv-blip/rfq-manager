import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# 第一阶段预留角色，暂不做真实权限判断
RoleType = Literal["admin", "group_leader", "sales", "viewer"]


class UserBase(BaseModel):
    """users 表公共字段"""
    username: str
    display_name: str | None = None
    role: RoleType = "sales"
    group_name: str | None = None
    email: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    """创建用户"""
    pass


class UserUpdate(BaseModel):
    """更新用户时可选传入的字段"""
    display_name: str | None = None
    role: RoleType | None = None
    group_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    """查询返回的完整用户数据"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


UserOut = UserRead
