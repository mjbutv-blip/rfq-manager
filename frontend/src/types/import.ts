export interface PreviewRow {
  row_number: number
  inquiry_no: string | null
  // new=新询单 / existing_inquiry_new_item=已有询单新增款式 /
  // duplicate_item=重复款式 / existing_inquiry_item_uncertain=已有询单款式待确认 /
  // failed=校验失败
  status: 'new' | 'existing_inquiry_new_item' | 'duplicate_item' | 'existing_inquiry_item_uncertain' | 'failed'
  raw_data: Record<string, unknown>      // 中文表头 → 原始值
  parsed_data: Record<string, unknown>   // 字段名 → 转换后值
  error_message: string | null
}

export interface ImportPreviewResponse {
  file_name: string
  sheet_name: string
  total_rows: number
  new_inquiry_rows: number                    // 将新建询单（及第一条款式）的行数
  existing_inquiry_new_item_rows: number      // 将向已有询单追加新款式的行数
  duplicate_item_rows: number                 // 重复款式，跳过
  uncertain_existing_item_rows: number        // 已有询单但无法判断新旧款式，跳过
  failed_rows: number                         // 校验失败
  importable_rows: number                     // new_inquiry_rows + existing_inquiry_new_item_rows
  skipped_rows: number                        // duplicate_item_rows + uncertain_existing_item_rows + failed_rows
  column_mapping: Record<string, string>
  missing_headers: string[]    // 必填字段在 Excel 中无对应列
  unmapped_headers: string[]   // Excel 列头未匹配任何字段名
  rows: PreviewRow[]
}

export interface ConfirmRowItem {
  row_number: number
  inquiry_no: string | null
  parsed_data: Record<string, unknown>
}

export interface ConfirmRowsRequest {
  file_name: string
  rows: ConfirmRowItem[]
  override_sales?: string
}

export interface ImportBatch {
  id: string
  file_name: string
  uploaded_by: string | null
  uploaded_at: string
  total_rows: number | null
  success_rows: number | null
  failed_rows: number | null
  new_rows: number | null          // 新建询单数
  existing_rows: number | null     // 向已有询单追加的款式数
  duplicate_rows: number | null    // 重复款式跳过数
  uncertain_rows: number | null    // 待确认款式跳过数
  validation_failed_rows: number | null  // 写库前校验失败（权限/必填字段缺失等）
  write_failed_rows: number | null       // 原本可导入，但实际写库时数据库异常（已被单行 savepoint 隔离）
  status: 'pending' | 'success' | 'partial' | 'failed'
  error_message: string | null
}
