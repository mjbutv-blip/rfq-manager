export interface OrderGroupListItem {
  id: string
  group_code: string
  group_name: string | null
  customer_code: string | null
  customer_name: string | null
  inquiry_count: number
  inquiry_nos: string[]
  source_file_name: string | null
  source_sheet: string | null
  source_start_row: number | null
  source_end_row: number | null
  group_status: string
  created_at: string | null
}

export interface OrderGroupScenarioSelection {
  inquiry_id: string
  inquiry_no: string
  factory_name: string | null
  factory_price: number | null
}

export interface OrderGroupScenario {
  code: string
  label: string
  selections: OrderGroupScenarioSelection[]
  factory_count: number
  customer_amount_cny: number | null
  factory_cost_cny: number | null
  gross_profit_cny: number | null
  gross_profit_rate: number | null
  missing_fields: string[]
  management_note: string
  unified_factory?: string | null
  extra_cost_vs_lowest?: number | null
  profit_gap_vs_lowest?: number | null
  profit_gap_vs_best_unified?: number | null
}

export interface OrderGroupInquiryAnalysis {
  inquiry_id: string
  inquiry_no: string
  customer_order_no: string | null
  product_name: string | null
  quantity: number | null
  order_status: string | null
  selected_factory: string | null
  final_quote_usd: number | null
  selected_factory_price_cny: number | null
  gross_profit_cny: number | null
  trade_amount_usd: number | null
  lowest_factory: string | null
  lowest_price: number | null
  highest_factory: string | null
  highest_price: number | null
  second_lowest_factory: string | null
  second_lowest_price: number | null
  spread_amount: number | null
  spread_pct: number | null
  quantity_share: number | null
  trade_amount_share: number | null
}

export interface OrderGroupDetail {
  group: {
    id: string
    group_code: string
    group_name: string | null
    source_file_name: string | null
    source_sheet: string | null
    source_start_row: number | null
    source_end_row: number | null
    customer_code: string | null
    group_status: string
    notes: string | null
    created_at: string | null
  }
  items: { id: string; inquiry_id: string; inquiry_no: string; source_sheet: string | null; source_row: number | null; sort_order: number }[]
  analysis: {
    inquiries: OrderGroupInquiryAnalysis[]
    scenarios: {
      lowest_each: OrderGroupScenario
      unified_factory: OrderGroupScenario[]
      current_selected: OrderGroupScenario
      custom_placeholder: { label: string; status: string }
    }
    auxiliary_metrics: {
      factory_concentration: {
        lowest_each_factory_count: number
        current_factory_count: number
        common_factory_count: number
      }
      missing_quote_inquiries: string[]
      quantity_key_inquiries: OrderGroupInquiryAnalysis[]
    }
    warnings: string[]
  }
}
