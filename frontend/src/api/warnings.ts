import client from "./client"
import type { InquiryWarning, WarningListResponse, WarningSummary } from "@/types/warning"

export async function fetchWarningSummary(): Promise<WarningSummary> {
  const { data } = await client.get<WarningSummary>("/warnings/summary")
  return data
}

export async function fetchWarnings(params?: {
  warning_type?: string
  warning_level?: string
  is_resolved?: boolean
  inquiry_no?: string
  group_name?: string
  responsible_sales?: string
  customer_short_name?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: string
}): Promise<WarningListResponse> {
  const { data } = await client.get<WarningListResponse>("/warnings", { params })
  return data
}

export async function fetchInquiryWarnings(inquiryId: string): Promise<InquiryWarning[]> {
  const { data } = await client.get<InquiryWarning[]>(`/warnings/by-inquiry/${inquiryId}`)
  return data
}

export async function resolveWarning(
  warningId: string,
  resolvedNote?: string,
): Promise<InquiryWarning> {
  const { data } = await client.patch<InquiryWarning>(`/warnings/${warningId}/resolve`, {
    resolved_note: resolvedNote ?? null,
  })
  return data
}

export async function runWarningCheck(): Promise<{
  scanned: number
  warnings_added: number
  warnings_removed: number
}> {
  const { data } = await client.post("/warnings/run-check")
  return data
}
