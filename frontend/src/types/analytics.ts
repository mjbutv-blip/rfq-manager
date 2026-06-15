export interface DashboardStats {
  total_inquiries: number
  total_quoted: number
  total_ordered: number
  conversion_rate: number
  total_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface SalesStat {
  responsible_sales: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface CustomerStat {
  customer_code: string | null
  customer_short_name: string | null
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_order_amount: number
  last_inquiry_date: string | null
  last_order_date: string | null
  top_product_category: string | null
  top_series: string | null
}

export interface GroupStat {
  group_name: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface ProductStat {
  product_category: string
  series_name: string
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  total_quantity: number
  total_trade_amount: number
  avg_final_quote: number | null
  avg_gross_profit_rate: number | null
}

export interface QuarterStat {
  year: number
  quarter: number
  quarter_label: string
  season_type: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  prev_quarter_trade: number | null
  trade_change_pct: number | null
}
