import client from "./client"
import type { OperationLogListResponse } from "@/types/operation_log"

export interface FetchLogsParams {
  actor_username?: string
  action_type?: string
  target_type?: string
  inquiry_no?: string
  status?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export async function fetchOperationLogs(params?: FetchLogsParams): Promise<OperationLogListResponse> {
  const { data } = await client.get<OperationLogListResponse>("/operation-logs", { params })
  return data
}
