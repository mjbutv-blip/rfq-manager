import client from "./client"
import type {
  InquiryStyleItem,
  InquiryStyleItemCreateRequest,
  InquiryStyleItemUpdateRequest,
  InquiryStyleProcess,
  InquiryStyleProcessCreateRequest,
  InquiryStyleSize,
  InquiryStyleSizeCreateRequest,
} from "@/types/inquiry_style_item"

export async function fetchInquiryStyleItems(inquiryId: string): Promise<InquiryStyleItem[]> {
  const { data } = await client.get<InquiryStyleItem[]>(`/inquiries/${inquiryId}/items`)
  return data
}

export async function fetchInquiryStyleItem(itemId: string): Promise<InquiryStyleItem> {
  const { data } = await client.get<InquiryStyleItem>(`/inquiry-items/${itemId}`)
  return data
}

export async function createInquiryStyleItem(
  inquiryId: string, body: InquiryStyleItemCreateRequest,
): Promise<InquiryStyleItem> {
  const { data } = await client.post<InquiryStyleItem>(`/inquiries/${inquiryId}/items`, body)
  return data
}

export async function updateInquiryStyleItem(
  itemId: string, body: InquiryStyleItemUpdateRequest,
): Promise<InquiryStyleItem> {
  const { data } = await client.patch<InquiryStyleItem>(`/inquiry-items/${itemId}`, body)
  return data
}

export async function deleteInquiryStyleItem(itemId: string): Promise<void> {
  await client.delete(`/inquiry-items/${itemId}`)
}

export async function createInquiryStyleProcess(
  itemId: string, body: InquiryStyleProcessCreateRequest,
): Promise<InquiryStyleProcess> {
  const { data } = await client.post<InquiryStyleProcess>(`/inquiry-items/${itemId}/processes`, body)
  return data
}

export async function deleteInquiryStyleProcess(itemId: string, processId: string): Promise<void> {
  await client.delete(`/inquiry-items/${itemId}/processes/${processId}`)
}

export async function createInquiryStyleSize(
  itemId: string, body: InquiryStyleSizeCreateRequest,
): Promise<InquiryStyleSize> {
  const { data } = await client.post<InquiryStyleSize>(`/inquiry-items/${itemId}/sizes`, body)
  return data
}

export async function deleteInquiryStyleSize(itemId: string, sizeId: string): Promise<void> {
  await client.delete(`/inquiry-items/${itemId}/sizes/${sizeId}`)
}
