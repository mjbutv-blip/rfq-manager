import client from "./client"
import type {
  CustomerDetail,
  CustomerListResponse,
  CustomerSummary,
  CustomerUpdate,
} from "@/types/customer"
import type { InquiryListResponse } from "@/types/inquiry"

export interface CustomerListParams {
  customer_code?: string
  customer_short_name?: string
  country?: string
  region?: string
  customer_category?: string
  group_name?: string
  responsible_sales?: string
  customer_level?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: string
}

export async function fetchCustomers(params?: CustomerListParams): Promise<CustomerListResponse> {
  const { data } = await client.get<CustomerListResponse>("/customers", { params })
  return data
}

export async function fetchCustomerSummary(): Promise<CustomerSummary> {
  const { data } = await client.get<CustomerSummary>("/customers/summary")
  return data
}

export async function fetchCustomer(customerCode: string): Promise<CustomerDetail> {
  const { data } = await client.get<CustomerDetail>(`/customers/${encodeURIComponent(customerCode)}`)
  return data
}

export async function fetchCustomerByName(name: string): Promise<CustomerDetail> {
  const { data } = await client.get<CustomerDetail>(`/customers/by-name/${encodeURIComponent(name)}`)
  return data
}

export async function fetchCustomerInquiries(
  customerCode: string,
  params?: {
    year?: number
    month?: string
    product_category?: string
    series_name?: string
    order_status?: string
    quote_status?: string
    page?: number
    page_size?: number
  },
): Promise<InquiryListResponse> {
  const { data } = await client.get<InquiryListResponse>(
    `/customers/${encodeURIComponent(customerCode)}/inquiries`,
    { params },
  )
  return data
}

export async function updateCustomer(
  customerCode: string,
  body: CustomerUpdate,
): Promise<CustomerDetail> {
  const { data } = await client.patch<CustomerDetail>(
    `/customers/${encodeURIComponent(customerCode)}`,
    body,
  )
  return data
}
