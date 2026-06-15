export interface FactoryStats {
  quote_count: number
  ordered_count: number
  conversion_rate: number | null
  total_trade_amount: number | null
  avg_factory_price: number | null
  top_categories: { name: string; count: number }[]
  top_series: { name: string; count: number }[]
  last_quote_date: string | null
  last_order_date: string | null
}

export interface Factory {
  id: string
  factory_code: string
  factory_name: string | null
  factory_short_name: string | null
  country: string | null
  region: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  main_categories: string[]
  capability_tags: string[]
  certificate_tags: string[]
  price_position: string | null
  moq: number | null
  normal_lead_time_days: number | null
  payment_terms: string | null
  cooperation_status: string | null
  risk_level: string | null
  risk_tags: string[]
  remark: string | null
  created_at: string | null
  updated_at: string | null
}

export interface FactoryListItem extends Factory {
  quote_count: number
  ordered_count: number
  order_conversion_rate: number | null
  total_trade_amount: number | null
}

export interface FactoryDetail extends Factory {
  quote_count: number
  ordered_count: number
  conversion_rate: number | null
  total_trade_amount: number | null
  avg_factory_price: number | null
  top_categories: { name: string; count: number }[]
  top_series: { name: string; count: number }[]
  last_quote_date: string | null
  last_order_date: string | null
}

export interface FactoryListResponse {
  total: number
  page: number
  page_size: number
  items: FactoryListItem[]
}

export interface FactorySummary {
  total_factories: number
  active_factories: number
  high_risk_factories: number
  factories_with_quotes: number
}

export interface FactoryQuoteRecord {
  id: string
  factory_id: string
  factory_name: string | null
  inquiry_id: string | null
  inquiry_no: string | null
  product_category: string | null
  product_name: string | null
  series_name: string | null
  quantity: number | null
  factory_price: number | null
  quote_date: string | null
  quote_status: string | null
  order_status: string | null
  is_ordered: boolean
  trade_amount: number | null
  remark: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface QuoteRecordCreate {
  factory_id: string
  inquiry_id?: string | null
  inquiry_no?: string | null
  product_category?: string | null
  product_name?: string | null
  series_name?: string | null
  quantity?: number | null
  factory_price?: number | null
  quote_date?: string | null
  quote_status?: string | null
  order_status?: string | null
  is_ordered?: boolean
  trade_amount?: number | null
  remark?: string | null
}

export interface FactoryUpdate {
  factory_name?: string | null
  factory_short_name?: string | null
  country?: string | null
  region?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  address?: string | null
  main_categories?: string[] | null
  capability_tags?: string[] | null
  certificate_tags?: string[] | null
  price_position?: string | null
  moq?: number | null
  normal_lead_time_days?: number | null
  payment_terms?: string | null
  cooperation_status?: string | null
  risk_level?: string | null
  risk_tags?: string[] | null
  remark?: string | null
}

// ── 显示常量 ──────────────────────────────────────────────────────────────────

export const COOPERATION_STATUS_LABEL: Record<string, string> = {
  active:      "合作中",
  inactive:    "暂停合作",
  blacklisted: "黑名单",
  potential:   "潜在工厂",
}

export const COOPERATION_STATUS_COLOR: Record<string, string> = {
  active:      "green",
  inactive:    "default",
  blacklisted: "red",
  potential:   "blue",
}

export const COOPERATION_STATUS_OPTIONS = [
  { label: "合作中",   value: "active" },
  { label: "暂停合作", value: "inactive" },
  { label: "黑名单",  value: "blacklisted" },
  { label: "潜在工厂", value: "potential" },
]

export const RISK_LEVEL_LABEL: Record<string, string> = {
  low:    "低",
  medium: "中",
  high:   "高",
}

export const RISK_LEVEL_COLOR: Record<string, string> = {
  low:    "green",
  medium: "orange",
  high:   "red",
}

export const RISK_LEVEL_OPTIONS = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
]

export const PRICE_POSITION_LABEL: Record<string, string> = {
  high:   "高端",
  medium: "中端",
  low:    "低端",
}

export const PRICE_POSITION_OPTIONS = [
  { label: "高端", value: "high" },
  { label: "中端", value: "medium" },
  { label: "低端", value: "low" },
]
