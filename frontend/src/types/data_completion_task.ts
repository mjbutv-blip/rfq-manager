export type TaskStatus = "open" | "in_progress" | "completed" | "cancelled"
export type TaskPriority = "high" | "medium" | "low"
export type DueState = "overdue" | "due_soon" | "normal" | "no_due_date"

export const DUE_STATE_LABEL: Record<DueState, string> = {
  overdue: "已逾期",
  due_soon: "即将到期",
  normal: "正常",
  no_due_date: "无截止日期",
}

export const DUE_STATE_COLOR: Record<DueState, string> = {
  overdue: "red",
  due_soon: "orange",
  normal: "default",
  no_due_date: "default",
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "待处理",
  in_progress: "处理中",
  completed: "已完成",
  cancelled: "已取消",
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  open: "orange",
  in_progress: "blue",
  completed: "green",
  cancelled: "default",
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
}

export const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "red",
  medium: "orange",
  low: "default",
}

export const SOURCE_MODULE_LABEL: Record<string, string> = {
  "quote-analysis-overview": "报价资料分析总览",
  "quote-data-quality": "报价资料完整度",
  "customer-category-styles": "客户品类款式分析",
  "process-analysis": "产品工艺分析",
  "size-analysis": "尺码范围分析",
  "quantity-analysis": "报价数量分析",
  "quote-preparer-analysis": "报价填报人分析",
}

export interface DataCompletionTask {
  id: string
  inquiry_id: string
  inquiry_item_id: string
  task_type: string
  missing_fields_json: string[]
  priority: TaskPriority
  status: TaskStatus
  assigned_to: string | null
  assigned_by: string | null
  created_by: string
  source_module: string
  source_reason: string | null
  remark: string | null
  due_date: string | null
  completed_at: string | null
  completed_by: string | null
  closed_reason: string | null
  created_at: string
  updated_at: string
  inquiry_no: string | null
  customer_short_name: string | null
  customer_code: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  responsible_sales: string | null
  group_name: string | null
  inquiry_date: string | null
  due_state: DueState | null
  overdue_days: number | null
  days_until_due: number | null
}

export interface DataCompletionTaskListResponse {
  items: DataCompletionTask[]
  total: number
}

export interface DataCompletionTaskCreateResponse {
  task: DataCompletionTask
  created: boolean
}

export interface DataCompletionTaskFilter {
  status?: TaskStatus
  priority?: TaskPriority
  assigned_to?: string
  group_name?: string
  customer_code?: string
  responsible_sales?: string
  due_state?: DueState
  is_overdue?: boolean
  is_unassigned?: boolean
  created_start?: string
  created_end?: string
  due_start?: string
  due_end?: string
  page?: number
  page_size?: number
}

export interface DataCompletionTaskCreateBody {
  source_module: string
  source_reason?: string
  priority?: TaskPriority
  assigned_to?: string
  due_date?: string
  remark?: string
}

export interface DataCompletionTaskUpdateBody {
  priority?: TaskPriority
  assigned_to?: string | null
  status?: TaskStatus
  due_date?: string | null
  remark?: string
}

// ── 补录任务看板（Step 11）─────────────────────────────────────────────────────

export interface DashboardFilter {
  group_name?: string
  assigned_to?: string
  priority?: TaskPriority
  status?: TaskStatus
  due_state?: DueState
  start_date?: string
  end_date?: string
}

export interface DashboardSummary {
  open_count: number
  in_progress_count: number
  completed_count: number
  cancelled_count: number
  high_priority_open_count: number
  overdue_count: number
  due_soon_count: number
  no_due_date_count: number
}

export interface AssigneeStat {
  assigned_to: string
  open_count: number
  in_progress_count: number
  overdue_count: number
  due_soon_count: number
  high_priority_count: number
  completed_count: number
}

export interface PriorityStat {
  priority: TaskPriority
  open_count: number
  in_progress_count: number
  overdue_count: number
  due_soon_count: number
}

export interface StatusStat {
  status: TaskStatus
  count: number
}

export interface DashboardTaskBrief {
  id: string
  inquiry_id: string
  inquiry_item_id: string
  priority: TaskPriority
  status: TaskStatus
  inquiry_no: string | null
  customer_short_name: string | null
  product_name: string | null
  style_no: string | null
  missing_fields_json: string[]
  assigned_to: string | null
  due_date: string | null
  overdue_days: number | null
  days_until_due: number | null
}

export interface DashboardResponse {
  summary: DashboardSummary
  by_assignee: AssigneeStat[]
  by_priority: PriorityStat[]
  by_status: StatusStat[]
  overdue_tasks: DashboardTaskBrief[]
  due_soon_tasks: DashboardTaskBrief[]
  unassigned_tasks: DashboardTaskBrief[]
}
