import client from "./client"
import type {
  CustomerCategoryStylesFilter,
  CustomerCategoryStylesResponse,
  CustomerStat,
  DashboardStats,
  GroupStat,
  OverviewFilter,
  PreparerAnalysisFilter,
  PreparerAnalysisResponse,
  ProcessAnalysisFilter,
  ProcessAnalysisResponse,
  ProductStat,
  QuantityAnalysisFilter,
  QuantityAnalysisResponse,
  QuarterStat,
  QuoteAnalysisOverviewResponse,
  QuoteDataQualityFilter,
  QuoteDataQualityResponse,
  SalesStat,
  SizeAnalysisFilter,
  SizeAnalysisResponse,
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

export async function fetchQuoteDataQuality(
  filter: QuoteDataQualityFilter,
): Promise<QuoteDataQualityResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<QuoteDataQualityResponse>("/analytics/quote-data-quality", { params })
  return data
}

export async function fetchCustomerCategoryStyles(
  filter: CustomerCategoryStylesFilter,
): Promise<CustomerCategoryStylesResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<CustomerCategoryStylesResponse>("/analytics/customer-category-styles", { params })
  return data
}

export async function fetchProcessAnalysis(
  filter: ProcessAnalysisFilter,
): Promise<ProcessAnalysisResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<ProcessAnalysisResponse>("/analytics/processes", { params })
  return data
}

export async function fetchSizeAnalysis(
  filter: SizeAnalysisFilter,
): Promise<SizeAnalysisResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<SizeAnalysisResponse>("/analytics/sizes", { params })
  return data
}

export async function fetchQuantityAnalysis(
  filter: QuantityAnalysisFilter,
): Promise<QuantityAnalysisResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<QuantityAnalysisResponse>("/analytics/quote-quantity", { params })
  return data
}

export async function fetchPreparerAnalysis(
  filter: PreparerAnalysisFilter,
): Promise<PreparerAnalysisResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<PreparerAnalysisResponse>("/analytics/quote-preparers", { params })
  return data
}

export async function fetchQuoteAnalysisOverview(
  filter: OverviewFilter,
): Promise<QuoteAnalysisOverviewResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  const { data } = await client.get<QuoteAnalysisOverviewResponse>("/analytics/quote-analysis-overview", { params })
  return data
}
