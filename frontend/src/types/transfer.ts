export interface TransferOrder {
  id: string
  inquiry_id: string
  inquiry_no: string
  transfer_status: "generated" | "regenerated" | "failed"
  generated_by: string
  generated_at: string
  factory_contract_file: string | null
  finance_transfer_file: string | null
  remark: string | null
  created_at: string
  updated_at: string
}

export interface TransferResponse {
  transfer_id: string
  inquiry_no: string
  factory_contract_url: string
  finance_transfer_url: string
  missing_fields: string[]
  message: string
}

export const TRANSFER_STATUS_LABEL: Record<string, string> = {
  generated:   "首次生成",
  regenerated: "重新生成",
  failed:      "生成失败",
}

export const TRANSFER_STATUS_COLOR: Record<string, string> = {
  generated:   "green",
  regenerated: "blue",
  failed:      "red",
}
