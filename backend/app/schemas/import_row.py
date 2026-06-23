import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ImportRowBase(BaseModel):
    """import_rows 表公共字段"""
    batch_id: uuid.UUID
    row_number: int | None = None
    inquiry_no: str | None = None
    # new / exists / duplicate_item / error / imported / skipped
    status: str
    raw_data_json: dict[str, Any] | None = None
    parsed_data_json: dict[str, Any] | None = None
    error_message: str | None = None


class ImportRowCreate(ImportRowBase):
    """写入行记录时传入（由 import_service 批量创建）"""
    pass


class ImportRowRead(ImportRowBase):
    """查询行记录时返回"""
    id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


ImportRowOut = ImportRowRead
