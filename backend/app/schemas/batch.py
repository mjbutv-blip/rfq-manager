import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ImportBatchOut(BaseModel):
    id: uuid.UUID
    file_name: str
    source_sheet: str | None = None
    imported_by: str | None = None
    imported_at: datetime
    row_count: int | None = None
    success_count: int | None = None
    fail_count: int | None = None
    status: str
    error_detail: dict | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


class ImportPreviewRow(BaseModel):
    """单行预览数据，raw 保留原始值，parsed 为解析后值，errors 为字段级错误"""
    row_index: int
    raw: dict[str, Any]
    parsed: dict[str, Any] | None = None
    errors: list[str] = []


class ImportPreviewResponse(BaseModel):
    file_name: str
    sheet_name: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    preview: list[ImportPreviewRow]
    column_mapping: dict[str, str]    # 字段名 → Excel 列头原始名


class ImportPreviewWithDiffResponse(BaseModel):
    """导入确认弹窗所需数据：预览 + 差异统计"""
    file_name: str
    sheet_name: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    new_count: int        # 将新增的询单数
    update_count: int     # 将更新的询单数
    unchanged_count: int  # 内容无变化（跳过）的询单数
    column_mapping: dict[str, str]
    preview: list[ImportPreviewRow]
