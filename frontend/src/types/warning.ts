export interface InquiryWarning {
  id: string
  inquiry_id: string
  inquiry_no: string
  warning_type: 'missing_required_field' | 'follow_up_timeout' | 'price_abnormal' | 'status_conflict' | 'sample_overdue' | 'production_delay'
  warning_level: 'low' | 'medium' | 'high'
  warning_message: string
  field_name: string | null
  current_value: string | null
  suggested_action: string | null
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolved_note: string | null
  created_at: string
  updated_at: string
}

export interface InquiryWarningRich extends InquiryWarning {
  customer_short_name: string | null
  group_name: string | null
  responsible_sales: string | null
  product_name: string | null
  quote_status: string | null
  order_status: string | null
}

export interface WarningListResponse {
  total: number
  page: number
  page_size: number
  items: InquiryWarningRich[]
}

export interface WarningSummary {
  total_unresolved: number
  high: number
  medium: number
  low: number
  missing_required_field: number
  follow_up_timeout: number
  price_abnormal: number
  status_conflict: number
  sample_overdue: number
  production_delay: number
}

export const WARNING_TYPE_LABEL: Record<string, string> = {
  missing_required_field: '必填字段缺失',
  follow_up_timeout:      '跟进超时',
  price_abnormal:         '价格异常',
  status_conflict:        '状态矛盾',
  sample_overdue:         '打样逾期',
  production_delay:       '生产延期',
}

export const WARNING_LEVEL_COLOR: Record<string, string> = {
  high:   'red',
  medium: 'orange',
  low:    'blue',
}

export const WARNING_LEVEL_LABEL: Record<string, string> = {
  high:   '高',
  medium: '中',
  low:    '低',
}
