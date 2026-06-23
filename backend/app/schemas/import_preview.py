"""
Excel 解析结果的 Pydantic Schema，用于 /api/v1/imports/preview

每行包含 raw_data（中文表头 → 原始值），顶层包含 missing_headers / unmapped_headers。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ParsedRowOut(BaseModel):
    """单行解析结果（HTTP 响应格式）"""

    row_number: int
    inquiry_no: str | None = None
    # new = 询单不存在，将新建询单 + 第一条款式明细
    # existing_inquiry_new_item = 询单已存在，当前款式未出现过，将追加 inquiry_items
    # duplicate_item = 当前款式在该询单下已存在（同文件内或数据库中），跳过
    # existing_inquiry_item_uncertain = 询单已存在，但缺少款号/完整款式信息，无法判断新旧，跳过
    # failed = 必填字段缺失、格式错误或无权限
    status: str
    raw_data: dict[str, Any] = {}       # {中文表头: 原始值}
    parsed_data: dict[str, Any] = {}    # {字段名: 转换后值}
    error_message: str | None = None


class ImportPreviewResult(BaseModel):
    """
    /api/v1/imports/preview 的完整响应体

    计数说明：
      total_rows                     = 解析到的数据行总数
      new_inquiry_rows                = 将新建询单（及其第一条款式）的行数
      existing_inquiry_new_item_rows  = 将向已有询单追加新款式明细的行数
      duplicate_item_rows             = 该询单下已存在相同款式，跳过的行数
      uncertain_existing_item_rows    = 询单已存在但无法判断款式新旧，跳过的行数
      failed_rows                     = 必填字段缺失/格式错误/无权限的行数
      importable_rows                 = new_inquiry_rows + existing_inquiry_new_item_rows
      skipped_rows                    = duplicate_item_rows + uncertain_existing_item_rows + failed_rows
    """

    file_name: str
    sheet_name: str
    total_rows: int
    new_inquiry_rows: int
    existing_inquiry_new_item_rows: int
    duplicate_item_rows: int
    uncertain_existing_item_rows: int
    failed_rows: int
    importable_rows: int
    skipped_rows: int
    column_mapping: dict[str, str] = {}    # {字段名: Excel 列头}
    missing_headers: list[str] = []        # 必填字段在 Excel 中无对应列
    unmapped_headers: list[str] = []       # Excel 列头未匹配任何字段名
    rows: list[ParsedRowOut] = []          # 最多返回 preview_limit 条
