import client from "@/api/client"
import type { OrderGroupDetail, OrderGroupListItem } from "@/types/order_group"

export async function fetchOrderGroups(): Promise<{ items: OrderGroupListItem[] }> {
  const { data } = await client.get<{ items: OrderGroupListItem[] }>("/order-groups")
  return data
}

export async function fetchOrderGroupDetail(groupId: string): Promise<OrderGroupDetail> {
  const { data } = await client.get<OrderGroupDetail>(`/order-groups/${groupId}`)
  return data
}

export async function fetchCombinedOrderGroupDetail(groupIds: string[]): Promise<OrderGroupDetail> {
  const params = new URLSearchParams()
  groupIds.forEach(id => params.append("ids", id))
  const { data } = await client.get<OrderGroupDetail>(`/order-groups/combined?${params.toString()}`)
  return data
}

export async function cancelOrderGroup(groupId: string): Promise<void> {
  await client.post(`/order-groups/${groupId}/cancel`)
}
