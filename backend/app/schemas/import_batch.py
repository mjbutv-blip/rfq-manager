import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ── ImportBatch Base / Create / Read ─────────────────────────────────────────

class ImportBatchBase(BaseModel):
    """import_batches 表公共字段"""
    file_name: str
    uploaded_by: str | None = None
    total_rows: int | None = None
    success_rows: int | None = None
    failed_rows: int | None = None
    new_rows: int | None = None             # 其中属于新增询单的行数
    existing_rows: int | None = None        # 其中已存在（跳过）的行数
    duplicate_rows: int | None = None       # 文件内部重复 inquiry_no 的行数
    status: str = "pending"
    error_message: str | None = None


class ImportBatchCreate(ImportBatchBase):
    """创建批次记录时传入"""
    pass


class ImportBatchRead(ImportBatchBase):
    """查询批次时返回"""
    id: uuid.UUID
    uploaded_at: datetime
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# 保持旧名称，供现有路由代码引用
ImportBatchOut = ImportBatchRead


# ── PreviewRow / ImportPreviewResponse ────────────────────────────────────────
# 这两个是导入预览接口专用，不对应数据库表

class PreviewRow(BaseModel):
    """单行预览结果"""

    row_number: int
    inquiry_no: str | None = None
    # new=将新增 / exists=已存在(跳过) / duplicate=文件内重复 / error=解析失败
    status: str
    parsed: dict[str, Any] = {}
    raw_data: dict[str, Any] = {}      # 新增：中文表头 → 原始值
    errors: list[str] = []


class ImportPreviewResponse(BaseModel):
    """POST /api/v1/imports/preview 的响应体（不写库）"""

    file_name: str
    sheet_name: str
    total_rows: int
    new_count: int           # 将新增
    exists_count: int        # 已存在（确认导入时跳过）
    duplicate_count: int = 0 # 新增：文件内部重复
    error_count: int         # 解析失败
    column_mapping: dict[str, str] = {}      # 字段名 → Excel 列头原始名
    missing_headers: list[str] = []          # 新增：必填字段无对应列
    unmapped_headers: list[str] = []         # 新增：Excel 列头未匹配字段
    rows: list[PreviewRow] = []              # 最多返回前 N 行预览
