import client from "./client"
import type {
  DashboardFilter,
  DashboardResponse,
  DataCompletionTask,
  DataCompletionTaskCreateBody,
  DataCompletionTaskCreateResponse,
  DataCompletionTaskFilter,
  DataCompletionTaskListResponse,
  DataCompletionTaskUpdateBody,
} from "@/types/data_completion_task"

export async function fetchDataCompletionTasks(
  filter: DataCompletionTaskFilter,
): Promise<DataCompletionTaskListResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<DataCompletionTaskListResponse>("/data-completion-tasks", { params })
  return data
}

export async function fetchDataCompletionTask(taskId: string): Promise<DataCompletionTask> {
  const { data } = await client.get<DataCompletionTask>(`/data-completion-tasks/${taskId}`)
  return data
}

export async function fetchActiveTaskForItem(itemId: string): Promise<DataCompletionTask | null> {
  const { data } = await client.get<DataCompletionTask | null>(`/inquiry-items/${itemId}/data-completion-task`)
  return data
}

export async function createDataCompletionTaskForItem(
  itemId: string, body: DataCompletionTaskCreateBody,
): Promise<DataCompletionTaskCreateResponse> {
  const { data } = await client.post<DataCompletionTaskCreateResponse>(
    `/inquiry-items/${itemId}/data-completion-task`, body,
  )
  return data
}

export async function updateDataCompletionTask(
  taskId: string, body: DataCompletionTaskUpdateBody,
): Promise<DataCompletionTask> {
  const { data } = await client.patch<DataCompletionTask>(`/data-completion-tasks/${taskId}`, body)
  return data
}

export async function completeDataCompletionTask(taskId: string, remark?: string): Promise<DataCompletionTask> {
  const { data } = await client.post<DataCompletionTask>(`/data-completion-tasks/${taskId}/complete`, { remark })
  return data
}

export async function cancelDataCompletionTask(taskId: string, reason?: string): Promise<DataCompletionTask> {
  const { data } = await client.post<DataCompletionTask>(`/data-completion-tasks/${taskId}/cancel`, { reason })
  return data
}

export async function fetchDataCompletionDashboard(
  filter: DashboardFilter,
): Promise<DashboardResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<DashboardResponse>("/data-completion-tasks/dashboard", { params })
  return data
}
