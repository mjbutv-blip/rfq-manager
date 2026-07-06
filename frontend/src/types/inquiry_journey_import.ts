export type JourneyImportStatus =
  | "matched"
  | "not_found"
  | "ambiguous"
  | "ready_to_fill"
  | "conflict"
  | "failed"

export interface JourneyImportField {
  key: string
  field: string
  field_name: string
  system_table: string
  system_value: unknown
  excel_value: unknown
  source_sheet: string
  source_cell: string
  status: "empty" | "fillable" | "same" | "conflict"
  default_action: string
}

export interface JourneyImportQuoteItemPreview {
  quote_type: "domestic" | "overseas"
  quote_round: number
  exists: boolean
  fields: JourneyImportField[]
}

export interface JourneyImportFactoryQuote {
  key: string
  quote_type: "domestic" | "overseas"
  quote_round: number
  factory_id: string | null
  factory_name: string
  factory_matched: boolean
  factory_price: number
  currency: string
  price_unit: string
  source_sheet: string
  source_cell: string
  status: "new" | "same" | "factory_quote_conflict"
  system_price: number | null
  default_action: string
  message: string | null
}

export interface JourneyImportPendingField {
  field_name: string
  excel_value: unknown
  source_sheet: string
  source_cell: string
  reason: string
  suggestion: string
}

export interface JourneyImportRow {
  inquiry_no: string | null
  inquiry_id: string | null
  status: JourneyImportStatus
  excel_locations: string[]
  errors: string[]
  inquiry_fields: JourneyImportField[]
  quote_items: JourneyImportQuoteItemPreview[]
  factory_quotes: JourneyImportFactoryQuote[]
  needs_confirmation: JourneyImportPendingField[]
  domestic_quote_rounds: number
  overseas_quote_rounds: number
  fillable_inquiry_fields: number
  quote_items_to_create: number
  factory_quotes_to_create: number
  conflict_count: number
  unmapped_count: number
  can_confirm: boolean
}

export interface JourneyImportPreview {
  file_name: string
  sheet_stats: Record<string, { rows: number; quote_rounds: number[] }>
  summary: Record<string, number>
  rows: JourneyImportRow[]
}

export interface JourneyImportConfirmResult {
  file_name: string
  sheet_stats: Record<string, { rows: number; quote_rounds: number[] }>
  summary: Record<string, unknown>
}

export interface JourneyImportDecisions {
  fields: Record<string, "keep_system" | "excel" | "skip">
  factory_quotes: Record<string, "keep_system" | "use_excel" | "add_remark">
}
