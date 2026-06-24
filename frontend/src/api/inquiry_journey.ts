import client from "./client"
import type { InquiryJourney } from "@/types/inquiry_journey"

export async function fetchInquiryJourney(inquiryId: string): Promise<InquiryJourney> {
  const { data } = await client.get<InquiryJourney>(`/inquiries/${inquiryId}/journey`)
  return data
}
