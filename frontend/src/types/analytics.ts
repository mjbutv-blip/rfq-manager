export interface DashboardStats {
  total_inquiries: number
  total_quoted: number
  total_ordered: number
  conversion_rate: number
  total_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface SalesStat {
  responsible_sales: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface CustomerStat {
  customer_code: string | null
  customer_short_name: string | null
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_order_amount: number
  last_inquiry_date: string | null
  last_order_date: string | null
  top_product_category: string | null
  top_series: string | null
}

export interface GroupStat {
  group_name: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  avg_gross_profit_rate: number | null
}

export interface ProductStat {
  product_category: string
  series_name: string
  inquiry_count: number
  ordered_count: number
  conversion_rate: number
  total_quantity: number
  total_trade_amount: number
  avg_final_quote: number | null
  avg_gross_profit_rate: number | null
}

export interface QuarterStat {
  year: number
  quarter: number
  quarter_label: string
  season_type: string
  inquiry_count: number
  quoted_count: number
  ordered_count: number
  conversion_rate: number
  total_trade_amount: number
  prev_quarter_trade: number | null
  trade_change_pct: number | null
}

// ── 报价资料数据完整度（Step 4）─────────────────────────────────────────────────

export interface QuoteDataQualityFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  import_batch_id?: string
  start_date?: string
  end_date?: string
}

export interface QuoteDataQualitySummary {
  total_inquiry_items: number
  complete_items: number
  partially_complete_items: number
  high_missing_items: number
  overall_completeness_rate: number
}

export interface FieldCoverage {
  field_key: string
  field_label: string
  filled_count: number
  missing_count: number
  coverage_rate: number
}

export interface CustomerQualityStat {
  customer_code: string | null
  customer_short_name: string | null
  total_items: number
  completeness_rate: number
  missing_style_no_count: number
  missing_process_count: number
  missing_size_count: number
  missing_preparer_count: number
  high_missing_count: number
}

export interface SalesQualityStat {
  responsible_sales: string
  total_items: number
  completeness_rate: number
  missing_field_count: number
  high_missing_count: number
}

export interface CategoryQualityStat {
  product_category: string
  total_items: number
  completeness_rate: number
  missing_process_count: number
  missing_size_count: number
  missing_style_no_count: number
}

export interface ImportBatchQualityStat {
  import_batch_id: string | null
  file_name: string | null
  uploaded_at: string | null
  total_items: number
  completeness_rate: number
  missing_field_count: number
}

export type CompletenessLevel = "complete" | "partial" | "high_missing"

export interface PriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  product_name: string | null
  style_no: string | null
  missing_fields: string[]
  missing_field_count: number
  completeness_level: CompletenessLevel
  inquiry_date: string | null
  order_status: string | null
  quote_status: string | null
}

export interface QuoteDataQualityResponse {
  summary: QuoteDataQualitySummary
  field_coverage: FieldCoverage[]
  by_customer: CustomerQualityStat[]
  by_sales: SalesQualityStat[]
  by_category: CategoryQualityStat[]
  by_import_batch: ImportBatchQualityStat[]
  priority_items: PriorityItem[]
}

// ── 客户 × 品类 × 款式分析（Step 5）─────────────────────────────────────────────

export interface CustomerCategoryStylesFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  series_name?: string
  start_date?: string
  end_date?: string
  min_style_count?: number
}

export interface TopCustomerBrief {
  customer_code: string | null
  customer_short_name: string | null
  style_count: number
}

export interface TopCategoryBrief {
  product_category: string
  style_count: number
}

export interface CustomerCategoryStylesSummary {
  total_customers: number
  total_categories: number
  total_style_items: number
  known_style_count: number
  unknown_style_count: number
  top_customer_by_styles: TopCustomerBrief | null
  top_category_by_styles: TopCategoryBrief | null
}

export interface CustomerCategoryMatrixEntry {
  customer_code: string | null
  customer_short_name: string
  product_category: string
  style_count: number
  item_count: number
  unique_style_count: number
  unknown_style_count: number
  quantity_total: number
  style_share_in_customer: number
  latest_inquiry_date: string | null
}

export interface CustomerRanking {
  customer_code: string | null
  customer_short_name: string
  style_count: number
  category_count: number
  top_category: string | null
  top_category_share: number | null
  quantity_total: number
  latest_inquiry_date: string | null
}

export interface CategoryRanking {
  product_category: string
  style_count: number
  customer_count: number
  quantity_total: number
  top_customer: string | null
  latest_inquiry_date: string | null
}

export interface PreferenceCategoryEntry {
  product_category: string
  style_count: number
  share: number
}

export type PreferenceType = "品类集中" | "品类均衡" | "样本不足"

export interface CustomerPreferenceProfile {
  customer_code: string | null
  customer_short_name: string
  total_style_count: number
  primary_categories: PreferenceCategoryEntry[]
  preference_type: PreferenceType
  notes: string[]
}

export interface PotentialDuplicateStyle {
  customer_code: string | null
  customer_short_name: string
  style_key: string
  product_name: string | null
  series_name: string | null
  duplicate_count: number
  inquiry_nos: string[]
  item_ids: string[]
}

export interface CustomerCategoryPriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  missing_fields: string[]
  impact: string
  inquiry_date: string | null
}

export interface CustomerCategoryStylesResponse {
  summary: CustomerCategoryStylesSummary
  customer_category_matrix: CustomerCategoryMatrixEntry[]
  customer_rankings: CustomerRanking[]
  category_rankings: CategoryRanking[]
  customer_preference_profiles: CustomerPreferenceProfile[]
  potential_duplicate_styles: PotentialDuplicateStyle[]
  priority_items: CustomerCategoryPriorityItem[]
}

// ── 产品工艺分析（Step 6）───────────────────────────────────────────────────────

export interface ProcessAnalysisFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  series_name?: string
  process_tag?: string
  is_special?: boolean
  start_date?: string
  end_date?: string
  min_usage_count?: number
}

export interface ProcessAnalysisSummary {
  total_style_items: number
  items_with_process_description: number
  items_with_process_tags: number
  items_without_process_description: number
  items_without_process_tags: number
  total_process_applications: number
  unique_process_tags: number
  special_process_applications: number
  special_process_share: number
}

export interface ProcessRanking {
  process_tag: string
  is_special: boolean
  application_count: number
  style_count: number
  customer_count: number
  category_count: number
  quantity_total: number
  average_final_quote: number | null
  average_factory_price: number | null
  average_gross_profit_rate: number | null
  latest_inquiry_date: string | null
}

export interface TopProcessBrief {
  process_tag: string
  application_count: number
}

export interface ProcessByCategory {
  product_category: string
  style_count: number
  items_with_process_tags: number
  process_coverage_rate: number
  special_process_style_count: number
  special_process_share: number
  top_processes: TopProcessBrief[]
}

export interface ProcessByCustomer {
  customer_code: string | null
  customer_short_name: string
  style_count: number
  process_coverage_rate: number
  special_process_style_count: number
  special_process_share: number
  top_processes: TopProcessBrief[]
}

export interface ProcessRiskSignal {
  signal_type: string
  label: string
  style_count: number
  hint: string
}

export interface ProcessPriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  process_description: string | null
  process_tags: string[]
  missing_fields: string[]
  risk_hint: string
  inquiry_date: string | null
  order_status: string | null
  quote_status: string | null
}

export interface ProcessAnalysisResponse {
  summary: ProcessAnalysisSummary
  process_rankings: ProcessRanking[]
  special_process_rankings: ProcessRanking[]
  by_category: ProcessByCategory[]
  by_customer: ProcessByCustomer[]
  process_risk_signals: ProcessRiskSignal[]
  priority_items: ProcessPriorityItem[]
}

// ── 尺码范围与尺码偏好分析（Step 7）─────────────────────────────────────────────

export interface SizeAnalysisFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  series_name?: string
  size_code?: string
  is_special_size?: boolean
  start_date?: string
  end_date?: string
  min_usage_count?: number
}

export interface SizeAnalysisSummary {
  total_style_items: number
  items_with_size_range: number
  items_with_standard_sizes: number
  items_without_size_data: number
  items_with_size_range_but_no_standard_sizes: number
  total_size_applications: number
  unique_size_codes: number
  special_size_applications: number
  special_size_share: number
  wide_span_style_count: number
}

export interface SizeRanking {
  size_code: string
  is_special_size: boolean
  application_count: number
  style_count: number
  customer_count: number
  category_count: number
  quantity_total: number
  latest_inquiry_date: string | null
}

export interface TopSizeBrief {
  size_code: string
  application_count: number
}

export interface SizeByCategory {
  product_category: string
  style_count: number
  size_coverage_rate: number
  special_size_style_count: number
  special_size_share: number
  average_size_span_count: number | null
  top_sizes: TopSizeBrief[]
}

export interface SizeByCustomer {
  customer_code: string | null
  customer_short_name: string
  style_count: number
  size_coverage_rate: number
  special_size_style_count: number
  special_size_share: number
  average_size_span_count: number | null
  top_sizes: TopSizeBrief[]
}

export interface SizeSpanBucket {
  span_bucket: string
  style_count: number
  share: number
}

export interface SizeRiskSignal {
  signal_type: string
  label: string
  style_count: number
  hint: string
}

export interface SizePriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  size_range: string | null
  size_codes: string[]
  missing_fields: string[]
  risk_hint: string
  inquiry_date: string | null
  order_status: string | null
  quote_status: string | null
}

export interface SizeAnalysisResponse {
  summary: SizeAnalysisSummary
  size_rankings: SizeRanking[]
  special_size_rankings: SizeRanking[]
  by_category: SizeByCategory[]
  by_customer: SizeByCustomer[]
  size_span_distribution: SizeSpanBucket[]
  size_risk_signals: SizeRiskSignal[]
  priority_items: SizePriorityItem[]
}

// ── 报价数量 / 订单规模分析（Step 8）───────────────────────────────────────────

export interface QuantityAnalysisFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  series_name?: string
  order_status?: string
  quote_status?: string
  quantity_bucket?: string
  start_date?: string
  end_date?: string
  min_quantity?: number
  max_quantity?: number
}

export interface QuantityAnalysisSummary {
  total_style_items: number
  items_with_quantity: number
  items_without_quantity: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
  min_quantity: number | null
  max_quantity: number | null
  small_batch_style_count: number
  large_batch_style_count: number
}

export interface QuantityDistributionBucket {
  quantity_bucket: string
  style_count: number
  style_share: number
  quantity_total: number
  customer_count: number
  category_count: number
}

export interface QuantityByCustomer {
  customer_code: string | null
  customer_short_name: string
  style_count: number
  items_with_quantity: number
  quantity_coverage_rate: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
  top_quantity_bucket: string | null
  small_batch_share: number
  large_batch_share: number
}

export interface QuantityByCategory {
  product_category: string
  style_count: number
  quantity_coverage_rate: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
  top_quantity_bucket: string | null
  small_batch_share: number
  large_batch_share: number
}

export interface QuantityBySales {
  responsible_sales: string
  style_count: number
  quantity_coverage_rate: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
  top_quantity_bucket: string | null
}

export interface QuantityByOrderStatus {
  quote_status: string
  order_status: string
  style_count: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
}

export interface QuantityRiskSignal {
  signal_type: string
  label: string
  style_count: number
  hint: string
}

export interface QuantityPriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  quantity: number | null
  quantity_bucket: string
  risk_hint: string
  inquiry_date: string | null
  order_status: string | null
  quote_status: string | null
}

export interface QuantityAnalysisResponse {
  summary: QuantityAnalysisSummary
  quantity_distribution: QuantityDistributionBucket[]
  by_customer: QuantityByCustomer[]
  by_category: QuantityByCategory[]
  by_sales: QuantityBySales[]
  by_order_status: QuantityByOrderStatus[]
  quantity_risk_signals: QuantityRiskSignal[]
  priority_items: QuantityPriorityItem[]
}

// ── 报价单填报人 / 人员维度分析（Step 9）─────────────────────────────────────────
// 本模块所有统计只是工作分布与资料质量展示，不是绩效评价。

export interface PreparerAnalysisFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  quote_prepared_by?: string
  customer_code?: string
  product_category?: string
  series_name?: string
  start_date?: string
  end_date?: string
  min_item_count?: number
}

export interface TopPreparerBrief {
  quote_prepared_by: string
  style_count: number
}

export interface PreparerAnalysisSummary {
  total_style_items: number
  items_with_preparer: number
  items_without_preparer: number
  preparer_coverage_rate: number
  unique_preparer_count: number
  top_preparer: TopPreparerBrief | null
  items_where_preparer_differs_from_responsible_sales: number
}

export interface PreparerRanking {
  quote_prepared_by: string
  style_count: number
  inquiry_count: number
  customer_count: number
  category_count: number
  quantity_total: number
  average_quantity: number | null
  median_quantity: number | null
  items_with_process_tags: number
  items_with_standard_sizes: number
  data_completeness_rate: number
  responsible_sales_count: number
  latest_inquiry_date: string | null
}

export interface PreparerByCustomer {
  quote_prepared_by: string
  customer_code: string | null
  customer_short_name: string
  style_count: number
  category_count: number
  quantity_total: number
  latest_inquiry_date: string | null
}

export interface PreparerByCategory {
  quote_prepared_by: string
  product_category: string
  style_count: number
  style_share_in_preparer: number
  quantity_total: number
  average_quantity: number | null
}

export interface PreparerByQuantityBucket {
  quote_prepared_by: string
  quantity_bucket: string
  style_count: number
  style_share: number
}

export interface PreparerByResponsibleSales {
  responsible_sales: string
  quote_prepared_by: string
  style_count: number
  inquiry_count: number
  same_person: boolean
}

export interface PreparerDataQualitySignal {
  signal_type: string
  label: string
  style_count: number
  hint: string
}

export interface PreparerPriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  quote_prepared_by: string | null
  product_name: string | null
  style_no: string | null
  product_category: string | null
  quantity: number | null
  inquiry_date: string | null
  quote_status: string | null
  order_status: string | null
  missing_fields: string[]
  risk_hint: string
}

export interface PreparerAnalysisResponse {
  summary: PreparerAnalysisSummary
  preparer_rankings: PreparerRanking[]
  by_customer: PreparerByCustomer[]
  by_category: PreparerByCategory[]
  by_quantity_bucket: PreparerByQuantityBucket[]
  by_responsible_sales: PreparerByResponsibleSales[]
  data_quality_signals: PreparerDataQualitySignal[]
  priority_items: PreparerPriorityItem[]
}

// ── 报价资料分析总览（统一入口）─────────────────────────────────────────────────

export interface OverviewFilter {
  year?: number
  group_name?: string
  responsible_sales?: string
  customer_code?: string
  product_category?: string
  start_date?: string
  end_date?: string
}

export interface OverviewSummary {
  total_style_items: number
  overall_completeness_rate: number
  items_needing_completion: number
  customer_count: number
  category_count: number
  unique_process_tags: number
  unique_size_codes: number
  items_with_quantity: number
  items_with_quote_preparer: number
}

export type PriorityLevel = "high" | "medium" | "low"

export interface KeyGap {
  field_key: string
  field_label: string
  missing_count: number
  coverage_rate: number
  priority_level: PriorityLevel
  target_module: string
}

export interface CustomerCategoryHighlight {
  customer_code: string | null
  customer_short_name: string
  top_category: string | null
  style_count: number
  top_category_share: number | null
  target_module: string
}

export interface ProcessHighlight {
  process_tag: string
  is_special: boolean
  application_count: number
  customer_count: number
  target_module: string
}

export interface SizeHighlight {
  size_code: string
  is_special_size: boolean
  application_count: number
  customer_count: number
  target_module: string
}

export interface QuantityHighlight {
  top_quantity_bucket: string | null
  small_batch_style_count: number
  large_batch_style_count: number
  items_without_quantity: number
  target_module: string
}

export interface PreparerHighlight {
  items_with_preparer: number
  items_without_preparer: number
  preparer_coverage_rate: number
  top_preparer: string | null
  top_preparer_style_count: number | null
  target_module: string
}

export interface OverviewPriorityItem {
  inquiry_id: string
  inquiry_no: string
  item_id: string
  customer_short_name: string | null
  responsible_sales: string | null
  product_name: string | null
  style_no: string | null
  missing_fields: string[]
  risk_hint: string
  inquiry_date: string | null
}

export interface ModuleLink {
  label: string
  target_module: string
}

export interface QuoteAnalysisOverviewResponse {
  summary: OverviewSummary
  key_gaps: KeyGap[]
  top_customer_categories: CustomerCategoryHighlight[]
  top_processes: ProcessHighlight[]
  top_sizes: SizeHighlight[]
  quantity_distribution_highlights: QuantityHighlight[]
  preparer_highlights: PreparerHighlight[]
  priority_items: OverviewPriorityItem[]
  module_links: ModuleLink[]
}
