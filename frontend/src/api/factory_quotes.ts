import client from "./client"
import type {
  FactoryQuote,
  FactoryQuoteCreateBody,
  FactoryQuoteListResponse,
  FactoryQuoteUpdateBody,
} from "@/types/factory_quote"

export async function fetchInquiryFactoryQuotes(inquiryId: string): Promise<FactoryQuoteListResponse> {
  const { data } = await client.get<FactoryQuoteListResponse>(`/inquiries/${inquiryId}/factory-quotes`)
  return data
}

export async function createFactoryQuote(
  inquiryId: string, body: FactoryQuoteCreateBody,
): Promise<FactoryQuote> {
  const { data } = await client.post<FactoryQuote>(`/inquiries/${inquiryId}/factory-quotes`, body)
  return data
}

export async function updateFactoryQuote(
  quoteId: string, body: FactoryQuoteUpdateBody,
): Promise<FactoryQuote> {
  const { data } = await client.patch<FactoryQuote>(`/factory-quotes/${quoteId}`, body)
  return data
}

export async function deleteFactoryQuote(quoteId: string): Promise<void> {
  await client.delete(`/factory-quotes/${quoteId}`)
}
