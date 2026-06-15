export interface ProductionRecord {
  id: string
  production_no: string
  inquiry_id: string | null
  inquiry_no: string | null
  customer_code: string | null
  customer_short_name: string | null
  factory_id: string | null
  factory_name: string | null
  product_category: string | null
  product_name: string | null
  series_name: string | null
  order_quantity: number | null
  order_unit_price: number | null
  trade_amount: number | null
  order_date: string | null
  delivery_date: string | null
  production_status: string
  fabric_status: string | null
  accessory_status: string | null
  production_schedule_status: string | null
  first_inspection_status: string | null
  mid_inspection_status: string | null
  final_inspection_status: string | null
  delay_risk_level: string | null
  delay_reason: string | null
  actual_finish_date: string | null
  responsible_sales: string | null
  group_name: string | null
  merchandiser: string | null
  remark: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductionListResponse {
  total: number
  page: number
  page_size: number
  items: ProductionRecord[]
}

export interface ProductionStats {
  total: number
  in_production: number
  overdue: number
  high_risk: number
  shipped: number
  completed: number
}

// ── production_status ────────────────────────────────────────────────────────

export const PRODUCTION_STATUS_OPTIONS = [
  { label: "待安排",      value: "pending" },
  { label: "已排产",      value: "scheduled" },
  { label: "面辅料准备中", value: "materials_preparing" },
  { label: "生产中",      value: "in_production" },
  { label: "质检中",      value: "inspection" },
  { label: "待出货",      value: "ready_to_ship" },
  { label: "已出货",      value: "shipped" },
  { label: "已完成",      value: "completed" },
  { label: "已延期",      value: "delayed" },
  { label: "已取消",      value: "cancelled" },
]

export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  pending:              "待安排",
  scheduled:            "已排产",
  materials_preparing:  "面辅料准备中",
  in_production:        "生产中",
  inspection:           "质检中",
  ready_to_ship:        "待出货",
  shipped:              "已出货",
  completed:            "已完成",
  delayed:              "已延期",
  cancelled:            "已取消",
}

export const PRODUCTION_STATUS_COLOR: Record<string, string> = {
  pending:              "default",
  scheduled:            "blue",
  materials_preparing:  "geekblue",
  in_production:        "processing",
  inspection:           "purple",
  ready_to_ship:        "cyan",
  shipped:              "green",
  completed:            "green",
  delayed:              "red",
  cancelled:            "default",
}

// ── fabric_status / accessory_status ─────────────────────────────────────────

export const MATERIAL_STATUS_OPTIONS = [
  { label: "未开始", value: "not_started" },
  { label: "已下单", value: "ordered" },
  { label: "进行中", value: "in_progress" },
  { label: "已到厂", value: "received" },
  { label: "有问题", value: "issue" },
]

export const MATERIAL_STATUS_LABEL: Record<string, string> = {
  not_started: "未开始",
  ordered:     "已下单",
  in_progress: "进行中",
  received:    "已到厂",
  issue:       "有问题",
}

export const MATERIAL_STATUS_COLOR: Record<string, string> = {
  not_started: "default",
  ordered:     "blue",
  in_progress: "processing",
  received:    "green",
  issue:       "red",
}

// ── production_schedule_status ───────────────────────────────────────────────

export const SCHEDULE_STATUS_OPTIONS = [
  { label: "未排产", value: "not_scheduled" },
  { label: "已排产", value: "scheduled" },
  { label: "生产中", value: "in_progress" },
  { label: "已完成", value: "completed" },
  { label: "已延期", value: "delayed" },
]

export const SCHEDULE_STATUS_LABEL: Record<string, string> = {
  not_scheduled: "未排产",
  scheduled:     "已排产",
  in_progress:   "生产中",
  completed:     "已完成",
  delayed:       "已延期",
}

export const SCHEDULE_STATUS_COLOR: Record<string, string> = {
  not_scheduled: "default",
  scheduled:     "blue",
  in_progress:   "processing",
  completed:     "green",
  delayed:       "red",
}

// ── inspection_status ────────────────────────────────────────────────────────

export const INSPECTION_STATUS_OPTIONS = [
  { label: "不需要", value: "not_required" },
  { label: "待检",   value: "pending" },
  { label: "检验中", value: "in_progress" },
  { label: "已通过", value: "passed" },
  { label: "不通过", value: "failed" },
]

export const INSPECTION_STATUS_LABEL: Record<string, string> = {
  not_required: "不需要",
  pending:      "待检",
  in_progress:  "检验中",
  passed:       "已通过",
  failed:       "不通过",
}

export const INSPECTION_STATUS_COLOR: Record<string, string> = {
  not_required: "default",
  pending:      "default",
  in_progress:  "processing",
  passed:       "green",
  failed:       "red",
}

// ── delay_risk_level ─────────────────────────────────────────────────────────

export const DELAY_RISK_OPTIONS = [
  { label: "无风险", value: "none" },
  { label: "低风险", value: "low" },
  { label: "中风险", value: "medium" },
  { label: "高风险", value: "high" },
]

export const DELAY_RISK_LABEL: Record<string, string> = {
  none:   "无风险",
  low:    "低风险",
  medium: "中风险",
  high:   "高风险",
}

export const DELAY_RISK_COLOR: Record<string, string> = {
  none:   "green",
  low:    "blue",
  medium: "orange",
  high:   "red",
}
