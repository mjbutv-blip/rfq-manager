// 询单款式明细（inquiry_items 表）相关类型。
// 注意：types/inquiry.ts 里的 `InquiryItem` 指的是"询单总表里的一行询单"，
// 与这里的"一个询单下的一个款式明细"完全不是一回事，因此单独命名避免混淆。

export interface InquiryStyleProcess {
  id: string
  inquiry_item_id: string
  process_tag: string
  process_type: string | null
  is_special: boolean
  created_at: string
  updated_at: string
}

export interface InquiryStyleSize {
  id: string
  inquiry_item_id: string
  size_code: string
  is_special_size: boolean
  created_at: string
  updated_at: string
}

export interface InquiryStyleItem {
  id: string
  inquiry_id: string
  inquiry_no: string | null
  product_name: string | null
  product_category: string | null
  series_name: string | null
  fabric_quality: string | null
  color_print: string | null
  size_range: string | null
  quantity: number | null
  quote_status: string | null
  order_status: string | null
  remark: string | null
  style_no: string | null
  quote_prepared_by: string | null
  process_description: string | null
  extra_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
  processes: InquiryStyleProcess[]
  sizes: InquiryStyleSize[]
}

// POST /inquiries/{inquiry_id}/items 请求体
export interface InquiryStyleItemCreateRequest {
  product_name: string
  style_no?: string | null
  product_category?: string | null
  series_name?: string | null
  quantity?: number | null
  size_range?: string | null
  quote_prepared_by?: string | null
  process_description?: string | null
  remark?: string | null
}

// PATCH /inquiry-items/{item_id} 请求体（全部可选）
export interface InquiryStyleItemUpdateRequest {
  product_name?: string | null
  product_category?: string | null
  series_name?: string | null
  size_range?: string | null
  quantity?: number | null
  quote_prepared_by?: string | null
  process_description?: string | null
  style_no?: string | null
  remark?: string | null
}

export interface InquiryStyleProcessCreateRequest {
  process_tag: string
  process_type?: string | null
  is_special?: boolean
}

export interface InquiryStyleSizeCreateRequest {
  size_code: string
  is_special_size?: boolean
}
