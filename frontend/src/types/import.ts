export interface PreviewRow {
  row_number: number
  inquiry_no: string | null
  // new=将新增 / existing=已存在 / duplicate=文件内重复 / failed=校验失败
  status: 'new' | 'existing' | 'duplicate' | 'failed'
  raw_data: Record<string, unknown>      // 中文表头 → 原始值
  parsed_data: Record<string, unknown>   // 字段名 → 转换后值
  error_message: string | null
}

export interface ImportPreviewResponse {
  file_name: string
  sheet_name: string
  total_rows: number
  success_rows: number   // new_rows + existing_rows
  new_rows: number
  existing_rows: number
  duplicate_rows: number
  failed_rows: number
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
}

export interface ImportBatch {
  id: string
  file_name: string
  uploaded_by: string | null
  uploaded_at: string
  total_rows: number | null
  success_rows: number | null
  failed_rows: number | null
  new_rows: number | null
  existing_rows: number | null
  duplicate_rows: number | null
  status: 'pending' | 'success' | 'partial' | 'failed'
  error_message: string | null
}
