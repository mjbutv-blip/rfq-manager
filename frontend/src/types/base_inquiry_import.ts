export type BaseInquiryImportStatus =
  | "new_inquiry"
  | "existing_inquiry"
  | "new_item_for_existing_inquiry"
  | "duplicate_item"
  | "customer_unmatched"
  | "item_identity_uncertain"
  | "failed"

export interface BaseInquiryImportSheetStat {
  rows: number
  present: boolean
  layout?: string
  has_customer_code_column?: boolean
}

export interface BaseInquiryImportSummary {
  total_rows: number
  new_inquiries: number
  new_items: number
  existing_inquiries: number
  duplicate_items: number
  customer_unmatched: number
  item_identity_uncertain: number
  failed: number
  importable_rows: number
}

export interface BaseInquiryImportRow {
  source_sheet: string
  row_number: number
  inquiry_no: string | null
  customer_order_no: string | null
  season: string | null
  order_status: string | null
  inquiry_date: string | null
  customer_code: string | null
  product_name: string | null
  product_category: string | null
  series_name: string | null
  quantity: number | null
  style_no: string | null
  notes: string | null
  status: BaseInquiryImportStatus
  flags: BaseInquiryImportStatus[]
  errors: string[]
  item_identity_key: string | null
  customer_matched: boolean
  customer_will_create: boolean
  can_confirm: boolean
  result_status?: string
  error_message?: string | null
}

export interface BaseInquiryImportPreview {
  file_name: string
  sheet_stats: Record<string, BaseInquiryImportSheetStat>
  summary: BaseInquiryImportSummary
  rows: BaseInquiryImportRow[]
  uniform_customer_code: string | null
}

export interface BaseInquiryImportConfirmResult {
  file_name: string
  batch_id: string
  summary: {
    created_inquiries: number
    created_items: number
    existing_inquiries: number
    duplicate_items_skipped: number
    customer_records_created: number
    customer_unmatched_rows: number
    uncertain_item_rows: number
    write_failed_rows: number
  }
  rows: BaseInquiryImportRow[]
  next_step: {
    message: string
    path: string
  }
}
