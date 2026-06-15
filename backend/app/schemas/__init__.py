"""
schemas 包：所有 Pydantic 请求/响应模型的统一入口。

命名规范：
  XxxBase   — 创建/更新共用字段
  XxxCreate — POST 写入时传入
  XxxUpdate — PATCH 更新时传入（字段全可选）
  XxxRead   — 查询时返回（含 id / 时间戳）
  XxxOut    — 与 XxxRead 相同，保留旧名称供兼容
"""

from app.schemas.customer import CustomerBase, CustomerCreate, CustomerRead, CustomerUpdate, CustomerOut
from app.schemas.group import GroupBase, GroupCreate, GroupRead, GroupUpdate, GroupOut
from app.schemas.user import UserBase, UserCreate, UserRead, UserUpdate, UserOut
from app.schemas.inquiry import (
    InquiryBase,
    InquiryCreate,
    InquiryRead,
    InquiryListItem,
    InquiryUpdate,
    InquiryFilter,
)
from app.schemas.inquiry_item import (
    InquiryItemBase,
    InquiryItemCreate,
    InquiryItemRead,
    InquiryItemOut,
)
from app.schemas.import_batch import (
    ImportBatchBase,
    ImportBatchCreate,
    ImportBatchRead,
    ImportBatchOut,
    PreviewRow,
    ImportPreviewResponse,
)
from app.schemas.import_row import ImportRowBase, ImportRowCreate, ImportRowRead, ImportRowOut

__all__ = [
    # Customer
    "CustomerBase", "CustomerCreate", "CustomerRead", "CustomerUpdate", "CustomerOut",
    # Group
    "GroupBase", "GroupCreate", "GroupRead", "GroupUpdate", "GroupOut",
    # User
    "UserBase", "UserCreate", "UserRead", "UserUpdate", "UserOut",
    # Inquiry
    "InquiryBase", "InquiryCreate", "InquiryRead",
    "InquiryListItem", "InquiryUpdate", "InquiryFilter",
    # InquiryItem
    "InquiryItemBase", "InquiryItemCreate", "InquiryItemRead", "InquiryItemOut",
    # ImportBatch
    "ImportBatchBase", "ImportBatchCreate", "ImportBatchRead", "ImportBatchOut",
    "PreviewRow", "ImportPreviewResponse",
    # ImportRow
    "ImportRowBase", "ImportRowCreate", "ImportRowRead", "ImportRowOut",
]
