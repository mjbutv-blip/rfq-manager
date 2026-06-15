export interface CustomerStats {
  total_inquiry_count: number
  total_order_count: number
  conversion_rate: number | null
  total_trade_amount: number | null
  avg_order_amount: number | null
  last_inquiry_date: string | null
  last_order_date: string | null
  is_active: boolean
  is_inactive?: boolean
  top_categories: { name: string; count: number }[]
  top_series: { name: string; count: number }[]
  primary_inquiry_months: { month: string; count: number }[]
  primary_order_months: { month: string; count: number }[]
  primary_seasons: { season: string; count: number }[]
  avg_days_to_order: number | null
}

export interface Customer {
  customer_code: string
  customer_name: string | null
  customer_short_name: string | null
  country: string | null
  region: string | null
  customer_category: string | null
  group_name: string | null
  responsible_sales: string | null
  customer_level: string | null
  customer_tags: string[]
  payment_terms: string | null
  price_preference: string | null
  follow_up_note: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CustomerListItem extends Customer {
  total_inquiry_count: number
  total_order_count: number
  conversion_rate: number | null
  total_trade_amount: number | null
  last_inquiry_date: string | null
  last_order_date: string | null
  is_active: boolean
}

export interface CustomerDetail extends Customer {
  stats: CustomerStats
}

export interface CustomerListResponse {
  total: number
  page: number
  page_size: number
  items: CustomerListItem[]
}

export interface CustomerSummary {
  total_customers: number
  active_customers: number
  customers_with_orders: number
  total_trade_amount: number
}

export interface CustomerUpdate {
  customer_category?: string | null
  customer_level?: string | null
  customer_tags?: string[] | null
  payment_terms?: string | null
  price_preference?: string | null
  follow_up_note?: string | null
}

export const CUSTOMER_LEVEL_OPTIONS = [
  { label: "高价值", value: "high_value", color: "gold" },
  { label: "潜力",   value: "potential",  color: "blue" },
  { label: "普通",   value: "normal",     color: "default" },
  { label: "沉默",   value: "inactive",   color: "gray" },
]

export const CUSTOMER_LEVEL_LABEL: Record<string, string> = {
  high_value: "高价值",
  potential:  "潜力",
  normal:     "普通",
  inactive:   "沉默",
}

export const CUSTOMER_LEVEL_COLOR: Record<string, string> = {
  high_value: "gold",
  potential:  "blue",
  normal:     "default",
  inactive:   "default",
}
