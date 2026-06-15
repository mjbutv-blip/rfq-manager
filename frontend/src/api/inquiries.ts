import client from "./client"
import type { InquiryFilter, InquiryItem, InquiryListResponse } from "@/types/inquiry"

export async function fetchInquiries(filter: InquiryFilter): Promise<InquiryListResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<InquiryListResponse>("/inquiries", { params })
  return data
}

export async function fetchInquiry(id: string): Promise<InquiryItem> {
  const { data } = await client.get<InquiryItem>(`/inquiries/${id}`)
  return data
}

export async function updateInquiry(id: string, body: Partial<InquiryItem>): Promise<InquiryItem> {
  const { data } = await client.patch<InquiryItem>(`/inquiries/${id}`, body)
  return data
}

export async function deleteInquiry(id: string): Promise<void> {
  await client.delete(`/inquiries/${id}`)
}

export async function exportInquiries(filter: Partial<InquiryFilter>): Promise<void> {
  // 去掉分页参数，导出全量
  const { page: _p, page_size: _ps, ...exportFilter } = filter
  const params = Object.fromEntries(
    Object.entries(exportFilter).filter(([, v]) => v !== "" && v != null)
  )
  const response = await client.get("/inquiries/export", {
    params,
    responseType: "blob",
  })

  // 尝试从 Content-Disposition 读取文件名，取不到时用默认名
  const disposition = (response.headers["content-disposition"] as string) ?? ""
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const filename = match
    ? decodeURIComponent(match[1])
    : `询单总表_${new Date().toISOString().slice(0, 10)}.xlsx`

  const url = URL.createObjectURL(new Blob([response.data as BlobPart]))
  const a   = document.createElement("a")
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
