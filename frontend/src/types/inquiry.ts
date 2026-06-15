export interface InquiryItem {
  id: string
  inquiry_no: string
  customer_code: string | null
  customer_order_no: string | null
  customer_name: string | null
  customer_short_name: string | null
  country: string | null
  region: string | null
  customer_category: string | null
  group_name: string | null
  responsible_sales: string | null
  assisting_sales: string | null
  product_category: string | null
  product_name: string | null
  series_name: string | null
  season: string | null
  quantity: number | null
  inquiry_date: string | null
  quote_status: string | null
  order_status: string | null
  final_quote: number | null
  factory_price: number | null
  gross_profit_rate: number | null
  order_unit_price: number | null
  order_quantity: number | null
  trade_amount: number | null
  order_date: string | null
  inquiry_year: number | null
  inquiry_month: string | null
  remark: string | null
  import_batch_id: string | null
  created_at: string
  updated_at: string
}

export interface InquiryListResponse {
  total: number
  page: number
  page_size: number
  items: InquiryItem[]
}

export interface InquiryFilter {
  inquiry_no?: string
  customer_code?: string
  customer_short_name?: string
  group_name?: string
  responsible_sales?: string
  assisting_sales?: string
  product_category?: string
  product_name?: string
  series_name?: string
  quote_status?: string
  order_status?: string
  season?: string
  year?: number
  month?: string
  start_date?: string   // YYYY-MM-DD
  end_date?: string     // YYYY-MM-DD
  sort_by?: string
  sort_order?: "asc" | "desc"
  page?: number
  page_size?: number
}

export const ORDER_STATUS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "跟进中", value: "跟进中" },
  { label: "下单", value: "下单" },
  { label: "已下单", value: "已下单" },
  { label: "确认转单", value: "确认转单" },
  { label: "流失", value: "流失" },
  { label: "取消", value: "取消" },
]

export const ORDER_STATUS_COLOR: Record<string, string> = {
  "下单":    "success",
  "已下单":  "success",
  "确认转单": "cyan",
  "跟进中":  "processing",
  "流失":    "error",
  "取消":    "default",
}

export const QUOTE_STATUS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "已报价", value: "已报价" },
  { label: "报价中", value: "报价中" },
  { label: "未报价", value: "未报价" },
]
