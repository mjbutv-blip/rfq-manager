import client from "./client"
import type { InquiryJourney, JourneyFirstRoundAnalysisBundle, JourneyFirstRoundQuoteItem } from "@/types/inquiry_journey"

export async function fetchInquiryJourney(inquiryId: string): Promise<InquiryJourney> {
  const { data } = await client.get<InquiryJourney>(`/inquiries/${inquiryId}/journey`)
  return data
}

export type QuoteItemUpdateBody = Partial<Pick<
  JourneyFirstRoundQuoteItem,
  | "order_quantity"
  | "calc_quantity"
  | "batch_shipment_count"
  | "port_misc_fee_cny"
  | "test_fee_cny"
  | "misc_fee_cny"
  | "included_other_fee_cny"
  | "pieces_per_card"
  | "destination_port_count"
  | "exchange_rate"
  | "net_profit_pct"
  | "commission_pct"
  | "selected_factory"
  | "selected_factory_price_cny"
  | "final_quote_usd"
  | "current_exchange_rate"
  | "customer_target_price_usd"
>>

export async function updateQuoteItem(quoteItemId: string, body: QuoteItemUpdateBody): Promise<JourneyFirstRoundQuoteItem> {
  const { data } = await client.patch<JourneyFirstRoundQuoteItem>(`/quote-items/${quoteItemId}`, body)
  return data
}

export async function createFirstRoundQuoteItem(inquiryId: string, body: QuoteItemUpdateBody): Promise<JourneyFirstRoundQuoteItem> {
  const { data } = await client.post<JourneyFirstRoundQuoteItem>(`/inquiries/${inquiryId}/quote-items`, body)
  return data
}

export async function analyzeFirstQuoteRound(inquiryId: string): Promise<JourneyFirstRoundAnalysisBundle> {
  const { data } = await client.post<JourneyFirstRoundAnalysisBundle>(`/inquiries/${inquiryId}/quote-rounds/1/analyze`)
  return data
}
