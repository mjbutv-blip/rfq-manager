import client from "./client"
import type { TransferOrder, TransferResponse } from "@/types/transfer"

export async function createTransfer(inquiryId: string): Promise<TransferResponse> {
  const { data } = await client.post<TransferResponse>(`/inquiries/${inquiryId}/transfer`)
  return data
}

export async function fetchInquiryTransfers(inquiryId: string): Promise<TransferOrder[]> {
  const { data } = await client.get<TransferOrder[]>(`/inquiries/${inquiryId}/transfers`)
  return data
}

export function getFactoryContractUrl(transferId: string): string {
  return `${client.defaults.baseURL}/transfers/${transferId}/factory-contract`
}

export function getFinanceTransferUrl(transferId: string): string {
  return `${client.defaults.baseURL}/transfers/${transferId}/finance-transfer`
}
