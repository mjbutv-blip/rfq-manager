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
  inquiry_item_create:          "新增询单款式明细",
  inquiry_item_update:          "编辑询单款式明细",
  inquiry_item_delete:          "删除询单款式明细",
  inquiry_item_process_create:  "添加款式工艺",
  inquiry_item_process_delete:  "删除款式工艺",
  inquiry_item_size_create:     "添加款式尺码",
  inquiry_item_size_delete:     "删除款式尺码",
  inquiry_item_import_append:         "为已有询单追加款式明细",
  inquiry_item_import_skip_duplicate: "跳过重复款式明细",
  inquiry_item_import_skip_uncertain: "跳过无法确认的已有询单款式",
  import_row_write_failed:           "导入行写入失败",
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
  data_completion_task_create:        "创建补录任务",
  data_completion_task_update:        "更新补录任务",
  data_completion_task_assign:        "分配补录任务",
  data_completion_task_start:         "开始处理补录任务",
  data_completion_task_complete:      "完成补录任务",
  data_completion_task_cancel:        "取消补录任务",
  data_completion_task_auto_complete: "自动完成补录任务",
}

export const TARGET_TYPE_LABEL: Record<string, string> = {
  inquiry:       "询单",
  inquiry_item:  "询单款式明细",
  import_batch:  "导入批次",
  warning:       "预警",
  transfer_order:"转单",
  export:        "导出",
  factory:       "工厂",
  sample:        "打样",
  production:    "生产跟单",
  system:        "系统",
  data_completion_task: "补录任务",
}

export const ACTION_TYPE_COLOR: Record<string, string> = {
  import_preview:       "default",
  import_confirm:       "blue",
  inquiry_update:       "orange",
  inquiry_delete:       "red",
  inquiry_export:       "cyan",
  inquiry_item_create:         "green",
  inquiry_item_update:         "orange",
  inquiry_item_delete:         "red",
  inquiry_item_process_create: "green",
  inquiry_item_process_delete: "red",
  inquiry_item_size_create:    "green",
  inquiry_item_size_delete:    "red",
  inquiry_item_import_append:         "green",
  inquiry_item_import_skip_duplicate: "orange",
  inquiry_item_import_skip_uncertain: "gold",
  import_row_write_failed:           "red",
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
  data_completion_task_create:        "green",
  data_completion_task_update:        "orange",
  data_completion_task_assign:        "blue",
  data_completion_task_start:         "geekblue",
  data_completion_task_complete:      "green",
  data_completion_task_cancel:        "red",
  data_completion_task_auto_complete: "lime",
}

export const ROLE_LABEL: Record<string, string> = {
  admin:        "管理员",
  group_leader: "组长",
  sales:        "业务员",
  viewer:       "只读",
}
