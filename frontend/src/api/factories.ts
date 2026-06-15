import client from "./client"
import type {
  FactoryDetail,
  FactoryListResponse,
  FactoryQuoteRecord,
  FactorySummary,
  FactoryUpdate,
  QuoteRecordCreate,
} from "@/types/factory"

export interface FactoryListParams {
  factory_name?: string
  factory_short_name?: string
  country?: string
  region?: string
  main_category?: string
  capability_tag?: string
  certificate_tag?: string
  price_position?: string
  cooperation_status?: string
  risk_level?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: string
}

export async function fetchFactories(params?: FactoryListParams): Promise<FactoryListResponse> {
  const { data } = await client.get<FactoryListResponse>("/factories", { params })
  return data
}

export async function fetchFactorySummary(): Promise<FactorySummary> {
  const { data } = await client.get<FactorySummary>("/factories/summary")
  return data
}

export async function fetchFactory(factoryId: string): Promise<FactoryDetail> {
  const { data } = await client.get<FactoryDetail>(`/factories/${factoryId}`)
  return data
}

export async function createFactory(body: Omit<FactoryUpdate, "factory_code"> & { factory_name: string }): Promise<FactoryDetail> {
  const { data } = await client.post<FactoryDetail>("/factories", body)
  return data
}

export async function updateFactory(factoryId: string, body: FactoryUpdate): Promise<FactoryDetail> {
  const { data } = await client.patch<FactoryDetail>(`/factories/${factoryId}`, body)
  return data
}

export async function fetchFactoryQuoteRecords(
  factoryId: string,
  params?: {
    inquiry_no?: string
    product_category?: string
    product_name?: string
    series_name?: string
    quote_status?: string
    order_status?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  },
): Promise<{ total: number; page: number; page_size: number; items: FactoryQuoteRecord[] }> {
  const { data } = await client.get(`/factories/${factoryId}/quote-records`, { params })
  return data
}

export async function fetchInquiryFactoryQuoteRecords(inquiryId: string): Promise<FactoryQuoteRecord[]> {
  const { data } = await client.get<FactoryQuoteRecord[]>(`/inquiries/${inquiryId}/factory-quote-records`)
  return data
}

export async function createQuoteRecord(body: QuoteRecordCreate): Promise<FactoryQuoteRecord> {
  const { data } = await client.post<FactoryQuoteRecord>("/factory-quote-records", body)
  return data
}

export async function updateQuoteRecord(recordId: string, body: Partial<QuoteRecordCreate>): Promise<FactoryQuoteRecord> {
  const { data } = await client.patch<FactoryQuoteRecord>(`/factory-quote-records/${recordId}`, body)
  return data
}

export async function deleteQuoteRecord(recordId: string): Promise<void> {
  await client.delete(`/factory-quote-records/${recordId}`)
}
