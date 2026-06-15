export interface SampleRecord {
  id: string
  sample_no: string
  inquiry_id: string | null
  inquiry_no: string | null
  customer_code: string | null
  customer_short_name: string | null
  factory_id: string | null
  factory_name: string | null
  product_category: string | null
  product_name: string | null
  series_name: string | null
  sample_type: string | null
  sample_quantity: number | null
  sample_status: string
  assigned_to_factory_at: string | null
  factory_due_date: string | null
  sample_sent_at: string | null
  courier_company: string | null
  tracking_no: string | null
  customer_received_at: string | null
  customer_feedback: string | null
  revision_count: number
  final_result: string
  sample_fee: number | null
  fee_paid_by: string | null
  fee_payment_status: string | null
  responsible_sales: string | null
  group_name: string | null
  remark: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SampleListResponse {
  total: number
  page: number
  page_size: number
  items: SampleRecord[]
}

export interface SampleStats {
  total: number
  making: number
  sent: number
  approved: number
  revision_needed: number
  overdue: number
  success_rate: number | null
  avg_cycle_days: number | null
  company_fee_total: number
}

export const SAMPLE_TYPE_OPTIONS = [
  { label: "色样",   value: "color_sample" },
  { label: "手感样", value: "handfeel_sample" },
  { label: "初样",   value: "first_sample" },
  { label: "修改样", value: "revised_sample" },
  { label: "产前样", value: "pp_sample" },
  { label: "确认样", value: "confirmation_sample" },
  { label: "其他",   value: "other" },
]

export const SAMPLE_TYPE_LABEL: Record<string, string> = {
  color_sample:         "色样",
  handfeel_sample:      "手感样",
  first_sample:         "初样",
  revised_sample:       "修改样",
  pp_sample:            "产前样",
  confirmation_sample:  "确认样",
  other:                "其他",
}

export const SAMPLE_STATUS_OPTIONS = [
  { label: "待安排",     value: "pending" },
  { label: "已分配工厂", value: "assigned" },
  { label: "制作中",     value: "making" },
  { label: "已寄出",     value: "sent" },
  { label: "客户已收到", value: "received" },
  { label: "已收到反馈", value: "feedback_received" },
  { label: "需要修改",   value: "revision_needed" },
  { label: "已确认",     value: "approved" },
  { label: "不通过",     value: "rejected" },
  { label: "已取消",     value: "cancelled" },
]

export const SAMPLE_STATUS_LABEL: Record<string, string> = {
  pending:           "待安排",
  assigned:          "已分配工厂",
  making:            "制作中",
  sent:              "已寄出",
  received:          "客户已收到",
  feedback_received: "已收到反馈",
  revision_needed:   "需要修改",
  approved:          "已确认",
  rejected:          "不通过",
  cancelled:         "已取消",
}

export const SAMPLE_STATUS_COLOR: Record<string, string> = {
  pending:           "default",
  assigned:          "blue",
  making:            "processing",
  sent:              "cyan",
  received:          "purple",
  feedback_received: "geekblue",
  revision_needed:   "orange",
  approved:          "green",
  rejected:          "red",
  cancelled:         "default",
}

export const FINAL_RESULT_OPTIONS = [
  { label: "待定",     value: "pending" },
  { label: "通过",     value: "approved" },
  { label: "不通过",   value: "rejected" },
  { label: "终止",     value: "cancelled" },
  { label: "已转订单", value: "converted_to_order" },
]

export const FINAL_RESULT_LABEL: Record<string, string> = {
  pending:            "待定",
  approved:           "通过",
  rejected:           "不通过",
  cancelled:          "终止",
  converted_to_order: "已转订单",
}

export const FINAL_RESULT_COLOR: Record<string, string> = {
  pending:            "default",
  approved:           "green",
  rejected:           "red",
  cancelled:          "default",
  converted_to_order: "blue",
}

export const FEE_PAID_BY_OPTIONS = [
  { label: "客户", value: "customer" },
  { label: "公司", value: "company" },
  { label: "工厂", value: "factory" },
  { label: "待定", value: "unknown" },
]

export const FEE_PAID_BY_LABEL: Record<string, string> = {
  customer: "客户",
  company:  "公司",
  factory:  "工厂",
  unknown:  "待定",
}

export const FEE_PAYMENT_STATUS_OPTIONS = [
  { label: "未付", value: "unpaid" },
  { label: "已付", value: "paid" },
  { label: "免收", value: "waived" },
  { label: "待定", value: "pending" },
]

export const FEE_PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid:  "未付",
  paid:    "已付",
  waived:  "免收",
  pending: "待定",
}
