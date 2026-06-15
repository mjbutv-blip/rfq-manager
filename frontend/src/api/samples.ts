import api from "./client"
import type { SampleListResponse, SampleRecord, SampleStats } from "@/types/sample"

export interface SampleListParams {
  sample_no?: string
  inquiry_no?: string
  customer_short_name?: string
  factory_name?: string
  product_category?: string
  product_name?: string
  series_name?: string
  sample_type?: string
  sample_status?: string
  final_result?: string
  responsible_sales?: string
  group_name?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: string
}

export async function fetchSamples(params: SampleListParams = {}): Promise<SampleListResponse> {
  const res = await api.get<SampleListResponse>("/samples", { params })
  return res.data
}

export async function fetchSampleStats(): Promise<SampleStats> {
  const res = await api.get<SampleStats>("/samples/stats")
  return res.data
}

export async function fetchSample(id: string): Promise<SampleRecord> {
  const res = await api.get<SampleRecord>(`/samples/${id}`)
  return res.data
}

export async function createSample(data: Record<string, unknown>): Promise<SampleRecord> {
  const res = await api.post<SampleRecord>("/samples", data)
  return res.data
}

export async function updateSample(id: string, data: Record<string, unknown>): Promise<SampleRecord> {
  const res = await api.patch<SampleRecord>(`/samples/${id}`, data)
  return res.data
}

export async function deleteSample(id: string): Promise<void> {
  await api.delete(`/samples/${id}`)
}

export async function fetchInquirySamples(inquiryId: string): Promise<SampleRecord[]> {
  const res = await api.get<SampleRecord[]>(`/inquiries/${inquiryId}/samples`)
  return res.data
}

export async function fetchFactorySamples(factoryId: string): Promise<SampleRecord[]> {
  const res = await api.get<SampleRecord[]>(`/factories/${factoryId}/samples`)
  return res.data
}

export async function fetchCustomerSamples(customerCode: string): Promise<SampleRecord[]> {
  const res = await api.get<SampleRecord[]>(`/customers/${customerCode}/samples`)
  return res.data
}
