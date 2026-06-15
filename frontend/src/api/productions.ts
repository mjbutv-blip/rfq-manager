import api from "./client"
import type { ProductionListResponse, ProductionRecord, ProductionStats } from "@/types/production"

export interface ProductionListParams {
  production_no?: string
  inquiry_no?: string
  customer_short_name?: string
  factory_name?: string
  product_category?: string
  product_name?: string
  production_status?: string
  delay_risk_level?: string
  responsible_sales?: string
  group_name?: string
  merchandiser?: string
  start_date?: string
  end_date?: string
  overdue_only?: boolean
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: string
}

export async function fetchProductions(params: ProductionListParams = {}): Promise<ProductionListResponse> {
  const res = await api.get<ProductionListResponse>("/productions", { params })
  return res.data
}

export async function fetchProductionStats(): Promise<ProductionStats> {
  const res = await api.get<ProductionStats>("/productions/stats")
  return res.data
}

export async function fetchProduction(id: string): Promise<ProductionRecord> {
  const res = await api.get<ProductionRecord>(`/productions/${id}`)
  return res.data
}

export async function createProduction(data: Record<string, unknown>): Promise<ProductionRecord> {
  const res = await api.post<ProductionRecord>("/productions", data)
  return res.data
}

export async function updateProduction(id: string, data: Record<string, unknown>): Promise<ProductionRecord> {
  const res = await api.patch<ProductionRecord>(`/productions/${id}`, data)
  return res.data
}

export async function deleteProduction(id: string): Promise<void> {
  await api.delete(`/productions/${id}`)
}

export async function fetchInquiryProductions(inquiryId: string): Promise<ProductionRecord[]> {
  const res = await api.get<ProductionRecord[]>(`/inquiries/${inquiryId}/productions`)
  return res.data
}

export async function fetchFactoryProductions(factoryId: string): Promise<ProductionRecord[]> {
  const res = await api.get<ProductionRecord[]>(`/factories/${factoryId}/productions`)
  return res.data
}

export async function fetchCustomerProductions(customerCode: string): Promise<ProductionRecord[]> {
  const res = await api.get<ProductionRecord[]>(`/customers/${customerCode}/productions`)
  return res.data
}
