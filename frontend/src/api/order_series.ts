import client from "@/api/client"
import type { OrderSeriesDetail, OrderSeriesListItem } from "@/types/order_series"

export async function fetchOrderSeries(): Promise<{ items: OrderSeriesListItem[] }> {
  const res = await client.get<{ items: OrderSeriesListItem[] }>("/order-series")
  return res.data
}

export async function fetchOrderSeriesDetail(seriesId: string): Promise<OrderSeriesDetail> {
  const res = await client.get<OrderSeriesDetail>(`/order-series/${seriesId}`)
  return res.data
}

export async function cancelOrderSeries(seriesId: string): Promise<{ ok: boolean }> {
  const res = await client.post<{ ok: boolean }>(`/order-series/${seriesId}/cancel`)
  return res.data
}
