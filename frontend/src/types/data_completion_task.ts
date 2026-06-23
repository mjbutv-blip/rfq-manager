export type TaskStatus = "open" | "in_progress" | "completed" | "cancelled"
export type TaskPriority = "high" | "medium" | "low"

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
