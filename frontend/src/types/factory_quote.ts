// 询单工厂价格录入（纵向报价卡片）
// 一张卡片 = 一个询单 + 一轮报价 + 一家工厂 + 一个工厂价格 + 备注

export type RoundComparison = "lowest" | "not_lowest" | "mismatch" | null

export const CURRENCY_OPTIONS = ["USD", "CNY", "EUR", "GBP", "HKD"]
export const PRICE_UNIT_OPTIONS = ["件", "PCS", "套", "打", "公斤", "米"]

export interface FactoryQuote {
  id: string
  inquiry_id: string | null
  inquiry_no: string | null
  factory_id: string | null
  factory_name: string | null
  has_factory_profile: boolean
  quote_round: number
  factory_price: number
  currency: string
  price_unit: string
  remark: string | null
  quoted_by: string | null
  quoted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  round_comparison: RoundComparison
}

export interface FactoryQuoteListResponse {
  items: FactoryQuote[]
  can_edit: boolean
}

export interface FactoryQuoteCreateBody {
  factory_id?: string | null
  factory_name?: string | null
  quote_round?: number | null
  factory_price: number
  currency?: string
  price_unit?: string
  remark?: string | null
}

export interface FactoryQuoteUpdateBody {
  factory_id?: string | null
  factory_name?: string | null
  quote_round?: number
  factory_price?: number
  currency?: string
  price_unit?: string
  remark?: string | null
}
