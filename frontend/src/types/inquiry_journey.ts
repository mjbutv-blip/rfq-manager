// 单个订单的来龙去脉表（询单报价详情表）
// 只读汇总——工厂报价部分的唯一数据源是 factory_quote_records（工厂报价录入卡片）。

export interface JourneyFactoryQuoteBrief {
  id: string
  factory_id: string | null
  factory_name: string | null
  factory_price: number | null
  quote_type: "domestic" | "overseas" | string
  currency: string | null
  price_unit: string | null
  remark: string | null
  source_sheet: string | null
  source_cell: string | null
  source?: string | null
  quoted_by: string | null
  quoted_at: string | null
  created_at: string
  is_lowest?: boolean
  is_highest?: boolean
  is_selected?: boolean
}

export type PriceMismatchReason = "no_quotes" | "mismatch" | "no_price" | null

export interface JourneyPriceAnalysis {
  comparable: boolean
  reason: PriceMismatchReason
  lowest_factories: string[]
  lowest_price: number | null
  second_lowest_factories: string[]
  second_lowest_price: number | null
  currency: string | null
  price_unit: string | null
}

export interface JourneyRound {
  quote_type: "domestic" | "overseas" | string
  quote_round: number
  factory1: JourneyFactoryQuoteBrief | null
  factory2: JourneyFactoryQuoteBrief | null
  other_factories: JourneyFactoryQuoteBrief[]
  price_analysis: JourneyPriceAnalysis
}

export interface JourneyFirstRoundQuoteItem {
  id: string
  quote_type: string
  quote_round: number
  order_quantity: number | null
  calc_quantity: number | null
  batch_shipment_count: number | null
  port_misc_fee_cny: number | null
  test_fee_cny: number | null
  misc_fee_cny: number | null
  included_other_fee_cny: number | null
  pieces_per_card: number | null
  destination_port_count: number | null
  material_received_date: string | null
  exchange_rate: number | null
  net_profit_pct: number | null
  commission_pct: number | null
  selected_factory: string | null
  selected_factory_price_cny: number | null
  final_quote_usd: number | null
  customer_target_price_usd: number | null
  quote_vs_target_ratio: number | null
  target_gap_cny: number | null
  target_profit_value: number | null
  target_price_gap_usd: number | null
  reverse_target_profit_value: number | null
  reverse_target_price_cny: number | null
  target_gross_profit_cny: number | null
  target_trade_amount_usd: number | null
  current_exchange_rate: number | null
  gross_profit_cny: number | null
  trade_amount_usd: number | null
}

export interface JourneyFirstRoundFactoryAnalysis {
  comparable: boolean
  reason: PriceMismatchReason
  quote_count: number
  valid_quote_count: number
  currency: string | null
  price_unit: string | null
  lowest_factories: string[]
  lowest_price: number | null
  highest_factories: string[]
  highest_price: number | null
  average_price: number | null
  median_price: number | null
  second_lowest_factories: string[]
  second_lowest_price: number | null
  highest_vs_lowest_pct: number | null
  second_lowest_vs_lowest_pct: number | null
  spread_amount: number | null
  spread_pct: number | null
  selected_factory: string | null
  selected_factory_price: number | null
  selected_factory_rank: number | null
  selected_factory_gap_amount: number | null
  selected_factory_gap_pct: number | null
  selected_factory_is_lowest: boolean | null
}

export interface JourneyAnalysisMessage {
  level?: "success" | "info" | "warning" | "error" | string
  title: string
  message?: string
  items?: string[]
}

export interface JourneyFactoryRiskAnalysis {
  lowest_factory_id: string | null
  lowest_factory_name: string | null
  risk_level: string | null
  risk_notes: string | null
  messages: JourneyAnalysisMessage[]
}

export interface JourneyFactorySelectionAdvice {
  triggered: boolean
  threshold_pct: number
  gap_pct: number | null
  lowest_factories: string[]
  second_lowest_factories: string[]
  risk_level: string | null
  attention_factory_names: string[]
  messages: JourneyAnalysisMessage[]
}

export interface JourneyHistoricalPriceReference {
  sample_count: number
  status: "ok" | "insufficient" | "no_data" | string
  message: string | null
  match_rule: string | null
  currency: string | null
  price_unit: string | null
  historical_lowest_price: number | null
  historical_highest_price: number | null
  historical_average_price: number | null
  historical_median_price: number | null
  normal_price_range_low: number | null
  normal_price_range_high: number | null
  current_lowest_below_range: boolean | null
  selected_price_above_range: boolean | null
  samples: {
    inquiry_id: string
    inquiry_no: string
    customer_code: string | null
    customer_short_name: string | null
    product_category: string | null
    product_name: string | null
    series_name: string | null
    factory_name: string | null
    factory_price: number | null
    currency: string | null
    price_unit: string | null
    quote_round: number | null
    quote_type: string | null
    quote_date: string | null
    inquiry_date: string | null
    order_status: string | null
  }[]
}

export interface JourneyCustomerTargetPriceAnalysis {
  customer_target_price_usd: number | null
  final_quote_usd: number | null
  target_vs_current_diff: number | null
  target_vs_current_diff_pct: number | null
  target_sales_amount_usd: number | null
  target_gross_profit_cny: number | null
  target_gross_profit_rate: number | null
  target_has_profit: boolean | null
  required_discount_pct: number | null
  missing_fields: string[]
  messages: JourneyAnalysisMessage[]
}

export interface JourneyFirstRoundAnalysisBundle {
  factory_price_analysis: JourneyFirstRoundFactoryAnalysis
  factory_risk_analysis: JourneyFactoryRiskAnalysis
  factory_selection_advice: JourneyFactorySelectionAdvice
  historical_price_reference: JourneyHistoricalPriceReference
  customer_target_price_analysis: JourneyCustomerTargetPriceAnalysis
  ai_analysis_prompt_data: Record<string, unknown>
  ai_analysis_messages: JourneyAnalysisMessage[]
  analysis_messages: JourneyAnalysisMessage[]
}

export interface JourneyFirstRound {
  quote_type: "domestic" | string
  quote_round: 1
  quote_item: JourneyFirstRoundQuoteItem | null
  factory_analysis: JourneyFirstRoundFactoryAnalysis
  analysis: JourneyFirstRoundAnalysisBundle
  factory_quotes: JourneyFactoryQuoteBrief[]
}

export interface JourneyApplicableFactory {
  factory_id: string
  factory_name: string | null
  factory_price: number | null
  currency: string | null
  price_unit: string | null
  quote_round: number | null
}

export interface JourneyInquiry {
  id: string
  inquiry_no: string
  customer_code: string | null
  customer_order_no: string | null
  customer_name: string | null
  customer_short_name: string | null
  product_category: string | null
  product_name: string | null
  style_count: number
  series_name: string | null
  season: string | null
  group_name: string | null
  responsible_sales: string | null
  inquiry_date: string | null
  quote_status: string | null
  order_status: string | null
  order_quantity: number | null
  quantity: number | null
  final_quote: number | null
  factory_price: number | null
  gross_profit_rate: number | null
  order_unit_price: number | null
  trade_amount: number | null
  order_date: string | null
  remark: string | null
}

export interface JourneyCustomer {
  customer_code: string
  customer_name: string | null
  customer_short_name: string | null
}

export interface InquiryJourney {
  inquiry: JourneyInquiry
  customer: JourneyCustomer | null
  applicable_factory: JourneyApplicableFactory | null
  first_round: JourneyFirstRound
  rounds: JourneyRound[]
  can_edit: boolean
}
