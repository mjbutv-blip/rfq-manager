"""
Excel 解析结果的 Pydantic Schema（Step 5 集成时用于 /api/v1/imports/preview）

与 import_batch.ImportPreviewResponse 的区别：
  - 每行包含 raw_data（中文表头 → 原始值）
  - 顶层包含 missing_headers / unmapped_headers
  - 统计字段拆分为 new_rows / existing_rows / duplicate_rows / failed_rows
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ParsedRowOut(BaseModel):
    """单行解析结果（HTTP 响应格式）"""

    row_number: int
    inquiry_no: str | None = None
    # new=将新增 / existing=已存在(跳过) / duplicate=文件内重复 / failed=校验失败
    status: str
    raw_data: dict[str, Any] = {}       # {中文表头: 原始值}
    parsed_data: dict[str, Any] = {}    # {字段名: 转换后值}
    error_message: str | None = None


class ImportPreviewResult(BaseModel):
    """
    /api/v1/imports/preview 的完整响应体（Step 5 启用）

    计数说明：
      total_rows    = 解析到的数据行总数
      success_rows  = new_rows + existing_rows
      new_rows      = 将新增到数据库的行数
      existing_rows = 已存在（确认导入时跳过）的行数
      duplicate_rows = 文件内部 inquiry_no 重复的行数
      failed_rows   = 必填字段缺失或格式错误的行数
    """

    file_name: str
    sheet_name: str
    total_rows: int
    success_rows: int
    new_rows: int
    existing_rows: int
    duplicate_rows: int
    failed_rows: int
    column_mapping: dict[str, str] = {}    # {字段名: Excel 列头}
    missing_headers: list[str] = []        # 必填字段在 Excel 中无对应列
    unmapped_headers: list[str] = []       # Excel 列头未匹配任何字段名
    rows: list[ParsedRowOut] = []          # 最多返回 preview_limit 条
