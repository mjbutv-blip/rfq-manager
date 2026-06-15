import client from "./client"
import type {
  CustomerStat,
  DashboardStats,
  GroupStat,
  ProductStat,
  QuarterStat,
  SalesStat,
} from "@/types/analytics"

export async function fetchDashboard(year?: number): Promise<DashboardStats> {
  const { data } = await client.get<DashboardStats>("/analytics/dashboard", {
    params: year ? { year } : undefined,
  })
  return data
}

export async function fetchSalesAnalysis(year?: number): Promise<SalesStat[]> {
  const { data } = await client.get<SalesStat[]>("/analytics/sales", {
    params: year ? { year } : undefined,
  })
  return data
}

export async function fetchCustomersAnalysis(year?: number): Promise<CustomerStat[]> {
  const { data } = await client.get<CustomerStat[]>("/analytics/customers", {
    params: year ? { year } : undefined,
  })
  return data
}

export async function fetchGroupsAnalysis(year?: number): Promise<GroupStat[]> {
  const { data } = await client.get<GroupStat[]>("/analytics/groups", {
    params: year ? { year } : undefined,
  })
  return data
}

export async function fetchProductsAnalysis(year?: number): Promise<ProductStat[]> {
  const { data } = await client.get<ProductStat[]>("/analytics/products", {
    params: year ? { year } : undefined,
  })
  return data
}

export async function fetchQuartersAnalysis(): Promise<QuarterStat[]> {
  const { data } = await client.get<QuarterStat[]>("/analytics/quarters")
  return data
}
