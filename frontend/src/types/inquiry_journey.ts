// 单个订单的来龙去脉表（询单报价详情表）
// 只读汇总——工厂报价部分的唯一数据源是 factory_quote_records（工厂报价录入卡片）。

export interface JourneyFactoryQuoteBrief {
  id: string
  factory_id: string | null
  factory_name: string | null
  factory_price: number | null
  currency: string | null
  price_unit: string | null
  remark: string | null
  quoted_by: string | null
  created_at: string
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
  quote_round: number
  factory1: JourneyFactoryQuoteBrief | null
  factory2: JourneyFactoryQuoteBrief | null
  other_factories: JourneyFactoryQuoteBrief[]
  price_analysis: JourneyPriceAnalysis
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
  product_name: string | null
  style_count: number
  series_name: string | null
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
  rounds: JourneyRound[]
  can_edit: boolean
}
