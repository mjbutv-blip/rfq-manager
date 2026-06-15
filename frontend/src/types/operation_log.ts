export interface OperationLog {
  id: string
  actor_username: string
  actor_display_name: string | null
  actor_role: string | null
  action_type: string
  target_type: string | null
  target_id: string | null
  inquiry_id: string | null
  inquiry_no: string | null
  description: string | null
  before_data_json: Record<string, unknown> | null
  after_data_json: Record<string, unknown> | null
  request_path: string | null
  request_method: string | null
  ip_address: string | null
  status: "success" | "failed"
  error_message: string | null
  created_at: string
}

export interface OperationLogListResponse {
  total: number
  page: number
  page_size: number
  items: OperationLog[]
}

export const ACTION_TYPE_LABEL: Record<string, string> = {
  import_preview:        "导入预览",
  import_confirm:        "确认导入",
  inquiry_update:        "编辑询单",
  inquiry_delete:        "删除询单",
  inquiry_export:        "导出询单",
  warning_resolve:       "处理预警",
  warning_run_check:     "运行预警检查",
  transfer_generate:     "一键转单",
  transfer_download:     "下载转单文件",
  factory_create:        "创建工厂",
  factory_update:        "编辑工厂",
  factory_quote_create:  "创建工厂报价记录",
  factory_quote_update:  "编辑工厂报价记录",
  factory_quote_delete:  "删除工厂报价记录",
  sample_create:            "创建打样记录",
  sample_update:            "编辑打样记录",
  sample_delete:            "删除打样记录",
  sample_status_change:     "打样状态变更",
  production_create:        "创建生产跟单",
  production_update:        "编辑生产跟单",
  production_delete:        "删除生产跟单",
  production_status_change: "生产状态变更",
}

export const TARGET_TYPE_LABEL: Record<string, string> = {
  inquiry:       "询单",
  import_batch:  "导入批次",
  warning:       "预警",
  transfer_order:"转单",
  export:        "导出",
  factory:       "工厂",
  sample:        "打样",
  production:    "生产跟单",
  system:        "系统",
}

export const ACTION_TYPE_COLOR: Record<string, string> = {
  import_preview:       "default",
  import_confirm:       "blue",
  inquiry_update:       "orange",
  inquiry_delete:       "red",
  inquiry_export:       "cyan",
  warning_resolve:      "green",
  warning_run_check:    "purple",
  transfer_generate:    "geekblue",
  transfer_download:    "lime",
  factory_create:       "green",
  factory_update:       "orange",
  factory_quote_create: "blue",
  factory_quote_update: "orange",
  factory_quote_delete: "red",
  sample_create:            "green",
  sample_update:            "orange",
  sample_delete:            "red",
  sample_status_change:     "purple",
  production_create:        "green",
  production_update:        "orange",
  production_delete:        "red",
  production_status_change: "purple",
}

export const ROLE_LABEL: Record<string, string> = {
  admin:        "管理员",
  group_leader: "组长",
  sales:        "业务员",
  viewer:       "只读",
}
