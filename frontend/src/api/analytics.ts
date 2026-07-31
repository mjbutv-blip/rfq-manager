import client from "./client"
import type { InquiryItem, InquiryListResponse } from "@/types/inquiry"
import type {
  CustomerConversionFilter,
  CustomerConversionResponse,
  CustomerCategoryStylesFilter,
  CustomerCategoryStylesResponse,
  FactorySupplyFilter,
  FactorySupplyResponse,
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

export async function fetchCustomerConversionAnalysis(
  filter: CustomerConversionFilter,
): Promise<CustomerConversionResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  try {
    const { data } = await client.get<CustomerConversionResponse>("/analytics/customer-conversion", { params })
    return data
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    const message = (error as Error).message
    if (status !== 404 && message !== "Not Found") throw error
    return fetchCustomerConversionFallback(filter)
  }
}

export async function fetchFactorySupplyAnalysis(
  filter: FactorySupplyFilter,
): Promise<FactorySupplyResponse> {
  const params = Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== "" && v != null)
  )
  try {
    const { data } = await client.get<FactorySupplyResponse>("/analytics/factory-supply", { params })
    return data
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    const message = (error as Error).message
    if (status !== 404 && message !== "Not Found") throw error
    return fetchFactorySupplyFallback(filter)
  }
}

interface FactoryQuoteListItem {
  id: string
  inquiry_id: string | null
  inquiry_no: string | null
  factory_name: string | null
  quote_type?: string | null
  quote_round: number | null
  factory_price: number | null
  currency: string | null
  price_unit: string | null
  created_at: string | null
  quoted_at?: string | null
}

interface FactoryQuoteGlobalResponse {
  total: number
  page: number
  page_size: number
  items: FactoryQuoteListItem[]
}

async function fetchFactorySupplyFallback(
  filter: FactorySupplyFilter,
): Promise<FactorySupplyResponse> {
  const pageSize = 200
  const baseParams = Object.fromEntries(
    Object.entries({
      factory_name: filter.factory_name,
      page_size: pageSize,
    }).filter(([, v]) => v !== "" && v != null)
  )

  const first = await client.get<FactoryQuoteGlobalResponse>("/factory-quotes", {
    params: { ...baseParams, page: 1 },
  })
  const quotes = [...first.data.items]
  const pages = Math.ceil(first.data.total / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const { data } = await client.get<FactoryQuoteGlobalResponse>("/factory-quotes", {
      params: { ...baseParams, page },
    })
    quotes.push(...data.items)
  }

  const filtered = quotes.filter(q => {
    if (filter.quote_round && q.quote_round !== filter.quote_round) return false
    if (filter.quote_type && (q.quote_type || "domestic") !== filter.quote_type) return false
    return true
  })
  return buildFactorySupplyFromQuotes(filtered)
}

function buildFactorySupplyFromQuotes(quotes: FactoryQuoteListItem[]): FactorySupplyResponse {
  const stats = new Map<string, {
    factory_name: string
    quote_count: number
    valid_quote_count: number
    inquiry_ids: Set<string>
    lowest_price_count: number
    prices: number[]
    ranks: number[]
    units: Set<string>
    latest_quote_date: string | null
  }>()
  const groups = new Map<string, FactoryQuoteListItem[]>()

  for (const q of quotes) {
    const name = (q.factory_name || "未知工厂").trim() || "未知工厂"
    const row = stats.get(name) ?? {
      factory_name: name,
      quote_count: 0,
      valid_quote_count: 0,
      inquiry_ids: new Set<string>(),
      lowest_price_count: 0,
      prices: [],
      ranks: [],
      units: new Set<string>(),
      latest_quote_date: null,
    }
    row.quote_count += 1
    if (q.inquiry_id) row.inquiry_ids.add(q.inquiry_id)
    if (q.factory_price != null) {
      row.valid_quote_count += 1
      row.prices.push(q.factory_price)
    }
    row.units.add(`${q.currency || "—"}/${q.price_unit || "—"}`)
    const date = q.quoted_at || q.created_at
    if (date && (!row.latest_quote_date || date > row.latest_quote_date)) row.latest_quote_date = date
    stats.set(name, row)

    if (q.inquiry_id && q.quote_round) {
      const groupKey = `${q.inquiry_id}|${q.quote_round}|${q.quote_type || "domestic"}`
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), q])
    }
  }

  let comparable = 0
  let incomparable = 0
  const spreads: FactorySupplyResponse["price_spread_top"] = []

  for (const [key, group] of groups.entries()) {
    const valid = group.filter(q => q.factory_price != null)
    if (!valid.length) continue
    const unitKeys = new Set(valid.map(q => `${q.currency || "—"}/${q.price_unit || "—"}`))
    if (unitKeys.size !== 1) {
      incomparable += 1
      continue
    }
    comparable += 1
    const uniquePrices = Array.from(new Set(valid.map(q => q.factory_price as number))).sort((a, b) => a - b)
    const lowest = uniquePrices[0]
    const highest = uniquePrices[uniquePrices.length - 1]
    for (const q of valid) {
      const name = (q.factory_name || "未知工厂").trim() || "未知工厂"
      const row = stats.get(name)
      if (!row) continue
      if (q.factory_price === lowest) row.lowest_price_count += 1
      row.ranks.push(1 + uniquePrices.filter(p => p < (q.factory_price as number)).length)
    }
    if (uniquePrices.length >= 2) {
      const [inquiry_id, quoteRound, quoteType] = key.split("|")
      spreads.push({
        inquiry_id,
        quote_round: Number(quoteRound),
        quote_type: quoteType,
        lowest_price: lowest,
        highest_price: highest,
        spread_amount: Math.round((highest - lowest) * 10000) / 10000,
        spread_pct: lowest ? Math.round(((highest - lowest) / lowest) * 10000) / 10000 : null,
      })
    }
  }

  const byFactory = Array.from(stats.values()).map(row => {
    const unitConsistent = row.units.size <= 1
    const avg = (values: number[]) => values.length
      ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100
      : null
    return {
      factory_name: row.factory_name,
      quote_count: row.quote_count,
      inquiry_count: row.inquiry_ids.size,
      valid_quote_count: row.valid_quote_count,
      lowest_price_count: row.lowest_price_count,
      selected_count: 0,
      selected_rate: 0,
      lowest_rate: row.valid_quote_count ? Math.round((row.lowest_price_count / row.valid_quote_count) * 1000) / 10 : 0,
      avg_rank: avg(row.ranks),
      avg_price: unitConsistent ? avg(row.prices) : null,
      currency_unit: Array.from(row.units).sort().join(", ") || "—",
      unit_consistent: unitConsistent,
      latest_quote_date: row.latest_quote_date,
    }
  }).sort((a, b) => b.valid_quote_count - a.valid_quote_count || b.lowest_price_count - a.lowest_price_count)

  const spreadValues = spreads.map(s => s.spread_pct).filter((v): v is number => v != null)
  const avgSpread = spreadValues.length
    ? Math.round((spreadValues.reduce((sum, v) => sum + v, 0) / spreadValues.length) * 1000) / 1000
    : null

  return {
    summary: {
      factory_count: byFactory.length,
      quote_count: quotes.length,
      valid_quote_count: quotes.filter(q => q.factory_price != null).length,
      inquiry_count: new Set(quotes.map(q => q.inquiry_id).filter(Boolean)).size,
      comparable_group_count: comparable,
      incomparable_group_count: incomparable,
      selected_quote_count: 0,
      avg_spread_pct: avgSpread,
    },
    by_factory: byFactory,
    price_spread_top: spreads.sort((a, b) => (b.spread_pct || 0) - (a.spread_pct || 0)).slice(0, 50),
    risk_signals: [
      ...(incomparable ? [{
        level: "warning" as const,
        title: "存在币种或单位不一致",
        description: `${incomparable} 个询单报价组币种或单位不一致，已跳过价格排名比较。`,
      }] : []),
    ],
    field_gaps: [
      { field: "选用工厂中标率", status: "后端接口未上线", note: "生产 fallback 只读取 factory_quote_records，无法关联 quote_items.selected_factory；新后端接口上线后可计算。" },
      { field: "客户 / 小组 / 业务员筛选", status: "后端接口未上线", note: "生产 fallback 只支持工厂名、轮次、报价类型筛选；新后端接口上线后可按询单归属筛选。" },
    ],
  }
}

async function fetchCustomerConversionFallback(
  filter: CustomerConversionFilter,
): Promise<CustomerConversionResponse> {
  const pageSize = 200
  const baseParams = Object.fromEntries(
    Object.entries({
      year: filter.year,
      customer_code: filter.customer_code,
      group_name: filter.group_name,
      responsible_sales: filter.responsible_sales,
      start_date: filter.start_date,
      end_date: filter.end_date,
      page_size: pageSize,
      sort_by: "inquiry_no",
      sort_order: "asc",
    }).filter(([, v]) => v !== "" && v != null)
  )

  const first = await client.get<InquiryListResponse>("/inquiries", {
    params: { ...baseParams, page: 1 },
  })
  const pages = Math.ceil(first.data.total / pageSize)
  const items: InquiryItem[] = [...first.data.items]
  for (let page = 2; page <= pages; page += 1) {
    const { data } = await client.get<InquiryListResponse>("/inquiries", {
      params: { ...baseParams, page },
    })
    items.push(...data.items)
  }

  return buildCustomerConversionFromInquiries(items)
}

function isOrdered(status: string | null): boolean {
  return status === "下单" || status === "已下单" || status === "确认转单"
}

function isQuoted(status: string | null): boolean {
  return !!status && status !== "未报价"
}

function rate(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 1000 : 0
}

function buildCustomerConversionFromInquiries(items: InquiryItem[]): CustomerConversionResponse {
  const customerMap = new Map<string, {
    customer_code: string | null
    customer_short_name: string | null
    inquiry_count: number
    quoted_count: number
    ordered_count: number
    trade_amount: number
  }>()
  const roundMap = new Map<number, { inquiry_count: number; ordered_count: number }>()

  let quoted = 0
  let ordered = 0
  let trade = 0

  for (const item of items) {
    const itemQuoted = isQuoted(item.quote_status)
    const itemOrdered = isOrdered(item.order_status)
    const quoteRound = itemQuoted ? 1 : 0

    if (itemQuoted) quoted += 1
    if (itemOrdered) {
      ordered += 1
      trade += item.trade_amount ?? 0
    }

    const key = item.customer_short_name || item.customer_code || "未知"
    const current = customerMap.get(key) ?? {
      customer_code: item.customer_code,
      customer_short_name: item.customer_short_name || key,
      inquiry_count: 0,
      quoted_count: 0,
      ordered_count: 0,
      trade_amount: 0,
    }
    current.inquiry_count += 1
    if (itemQuoted) current.quoted_count += 1
    if (itemOrdered) {
      current.ordered_count += 1
      current.trade_amount += item.trade_amount ?? 0
    }
    customerMap.set(key, current)

    const round = roundMap.get(quoteRound) ?? { inquiry_count: 0, ordered_count: 0 }
    round.inquiry_count += 1
    if (itemOrdered) round.ordered_count += 1
    roundMap.set(quoteRound, round)
  }

  const byCustomer = Array.from(customerMap.values())
    .map(row => ({
      ...row,
      quote_rate: rate(row.quoted_count, row.inquiry_count),
      conversion_rate: rate(row.ordered_count, row.inquiry_count),
      target_reached_rate: null,
      avg_quote_cycle_days: null,
    }))
    .sort((a, b) => b.inquiry_count - a.inquiry_count || b.ordered_count - a.ordered_count)

  const quoteRoundRelation = Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([quote_round_count, row]) => ({
      quote_round_count,
      label: quote_round_count === 0 ? "未报价" : "已报价",
      inquiry_count: row.inquiry_count,
      ordered_count: row.ordered_count,
      conversion_rate: rate(row.ordered_count, row.inquiry_count),
    }))

  return {
    summary: {
      total_inquiries: items.length,
      quoted_inquiries: quoted,
      ordered_inquiries: ordered,
      quote_rate: rate(quoted, items.length),
      conversion_rate: rate(ordered, items.length),
      total_trade_amount: Math.round(trade * 100) / 100,
      avg_quote_cycle_days: null,
      target_price_sample_count: 0,
      target_reached_count: 0,
      target_reached_rate: null,
      avg_target_gap_cny: null,
    },
    by_customer: byCustomer,
    quote_round_relation: quoteRoundRelation,
    quote_cycle_distribution: {
      within_3_days: 0,
      within_7_days: 0,
      over_7_days: 0,
      unknown: items.length,
    },
    target_price: {
      sample_count: 0,
      reached_count: 0,
      reached_rate: null,
      avg_target_gap_cny: null,
    },
    details: items.slice(0, 300).map(item => ({
      inquiry_id: item.id,
      inquiry_no: item.inquiry_no,
      customer_code: item.customer_code,
      customer_short_name: item.customer_short_name,
      quote_status: item.quote_status,
      order_status: item.order_status,
      inquiry_date: item.inquiry_date,
      order_date: item.order_date,
      quote_round_count: isQuoted(item.quote_status) ? 1 : 0,
      quote_cycle_days: null,
      final_quote_usd: item.final_quote,
      customer_target_price_usd: null,
      target_reached: null,
      trade_amount: item.trade_amount ?? 0,
    })),
    field_gaps: [
      { field: "报价轮次明细", status: "后端接口未上线", note: "当前生产环境 fallback 使用询单总表，只能区分已报价/未报价；新后端接口上线后可按 quote_items 统计真实轮次。" },
      { field: "客户目标价", status: "后端接口未上线", note: "目标价存在于 quote_items，生产后端新接口上线前不从询单总表推断。" },
      { field: "报价周期", status: "字段缺失", note: "需要使用 quote_items 的收到资料日期和给客人报价日期计算。" },
      { field: "未下单原因", status: "字段缺失", note: "当前不统计未下单原因，避免误判。" },
    ],
  }
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
