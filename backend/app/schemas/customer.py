import uuid
from datetime import datetime

from pydantic import BaseModel


class CustomerBase(BaseModel):
    """customers 表公共字段"""
    customer_code: str
    customer_name: str | None = None
    customer_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    customer_category: str | None = None    # 客户类别：新客户/老客户/高价值/潜力
    group_name: str | None = None
    responsible_sales: str | None = None


class CustomerCreate(CustomerBase):
    """创建客户时传入的字段"""
    pass


class CustomerUpdate(BaseModel):
    """更新客户时可选传入的字段"""
    customer_name: str | None = None
    customer_short_name: str | None = None
    country: str | None = None
    region: str | None = None
    customer_category: str | None = None
    group_name: str | None = None
    responsible_sales: str | None = None


class CustomerRead(CustomerBase):
    """查询返回的完整客户数据"""
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# 保持旧名称，供已有代码引用
CustomerOut = CustomerRead
