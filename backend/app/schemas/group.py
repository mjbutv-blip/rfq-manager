import uuid
from datetime import datetime

from pydantic import BaseModel


class GroupBase(BaseModel):
    """groups 表公共字段"""
    group_name: str
    group_leader: str | None = None


class GroupCreate(GroupBase):
    """创建小组"""
    pass


class GroupUpdate(BaseModel):
    """更新小组"""
    group_leader: str | None = None


class GroupRead(GroupBase):
    """查询返回的完整小组数据"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


GroupOut = GroupRead
