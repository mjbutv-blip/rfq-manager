from __future__ import annotations

from datetime import date
from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_inquiries: int
    total_quoted: int
    total_ordered: int
    conversion_rate: float
    total_trade_amount: float
    avg_gross_profit_rate: float | None


class SalesStat(BaseModel):
    responsible_sales: str
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_trade_amount: float
    avg_gross_profit_rate: float | None


class CustomerStat(BaseModel):
    customer_code: str | None
    customer_short_name: str | None
    inquiry_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_order_amount: float
    last_inquiry_date: date | None
    last_order_date: date | None
    top_product_category: str | None
    top_series: str | None


class GroupStat(BaseModel):
    group_name: str
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    avg_gross_profit_rate: float | None


class ProductStat(BaseModel):
    product_category: str
    series_name: str
    inquiry_count: int
    ordered_count: int
    conversion_rate: float
    total_quantity: int
    total_trade_amount: float
    avg_final_quote: float | None
    avg_gross_profit_rate: float | None


class QuarterStat(BaseModel):
    year: int
    quarter: int
    quarter_label: str
    season_type: str          # SS or FW/AW
    inquiry_count: int
    quoted_count: int
    ordered_count: int
    conversion_rate: float
    total_trade_amount: float
    prev_quarter_trade: float | None
    trade_change_pct: float | None


# ── 报价资料数据完整度（Step 4）─────────────────────────────────────────────────
# 统计最小单位是 inquiry_items（款式明细），不是 inquiries。

class QuoteDataQualitySummary(BaseModel):
    total_inquiry_items: int
    complete_items: int
    partially_complete_items: int
    high_missing_items: int
    overall_completeness_rate: float   # complete_items / total_inquiry_items


class FieldCoverage(BaseModel):
    field_key: str
    field_label: str
    filled_count: int
    missing_count: int
    coverage_rate: float


class CustomerQualityStat(BaseModel):
    customer_code: str | None
    customer_short_name: str | None
    total_items: int
    completeness_rate: float
    missing_style_no_count: int
    missing_process_count: int
    missing_size_count: int
    missing_preparer_count: int
    high_missing_count: int


class SalesQualityStat(BaseModel):
    responsible_sales: str
    total_items: int
    completeness_rate: float
    missing_field_count: int       # 全部字段缺失次数总和（跨所有款式）
    high_missing_count: int


class CategoryQualityStat(BaseModel):
    product_category: str
    total_items: int
    completeness_rate: float
    missing_process_count: int
    missing_size_count: int
    missing_style_no_count: int


class ImportBatchQualityStat(BaseModel):
    import_batch_id: str | None     # None 表示该询单不是通过导入创建（如手工新增）
    file_name: str | None
    uploaded_at: str | None
    total_items: int
    completeness_rate: float
    missing_field_count: int


class PriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    product_name: str | None
    style_no: str | None
    missing_fields: list[str]
    missing_field_count: int
    completeness_level: str        # complete | partial | high_missing
    inquiry_date: date | None
    order_status: str | None
    quote_status: str | None


class QuoteDataQualityResponse(BaseModel):
    summary: QuoteDataQualitySummary
    field_coverage: list[FieldCoverage]
    by_customer: list[CustomerQualityStat]
    by_sales: list[SalesQualityStat]
    by_category: list[CategoryQualityStat]
    by_import_batch: list[ImportBatchQualityStat]
    priority_items: list[PriorityItem]


# ── 客户 × 品类 × 款式分析（Step 5）─────────────────────────────────────────────
# 统计最小单位是 inquiry_items（款式明细），不是 inquiries。

class TopCustomerBrief(BaseModel):
    customer_code: str | None
    customer_short_name: str | None
    style_count: int


class TopCategoryBrief(BaseModel):
    product_category: str
    style_count: int


class CustomerCategoryStylesSummary(BaseModel):
    total_customers: int
    total_categories: int
    total_style_items: int
    known_style_count: int
    unknown_style_count: int
    top_customer_by_styles: TopCustomerBrief | None
    top_category_by_styles: TopCategoryBrief | None


class CustomerCategoryMatrixEntry(BaseModel):
    customer_code: str | None
    customer_short_name: str
    product_category: str
    style_count: int
    item_count: int
    unique_style_count: int
    unknown_style_count: int
    quantity_total: int
    style_share_in_customer: float
    latest_inquiry_date: date | None


class CustomerRanking(BaseModel):
    customer_code: str | None
    customer_short_name: str
    style_count: int
    category_count: int
    top_category: str | None
    top_category_share: float | None
    quantity_total: int
    latest_inquiry_date: date | None


class CategoryRanking(BaseModel):
    product_category: str
    style_count: int
    customer_count: int
    quantity_total: int
    top_customer: str | None
    latest_inquiry_date: date | None


class PreferenceCategoryEntry(BaseModel):
    product_category: str
    style_count: int
    share: float


class CustomerPreferenceProfile(BaseModel):
    customer_code: str | None
    customer_short_name: str
    total_style_count: int
    primary_categories: list[PreferenceCategoryEntry]
    preference_type: str       # 品类集中 | 品类均衡 | 样本不足
    notes: list[str]


class PotentialDuplicateStyle(BaseModel):
    customer_code: str | None
    customer_short_name: str
    style_key: str
    product_name: str | None
    series_name: str | None
    duplicate_count: int
    inquiry_nos: list[str]
    item_ids: list[str]


class CustomerCategoryPriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    product_name: str | None
    style_no: str | None
    product_category: str | None
    missing_fields: list[str]
    impact: str
    inquiry_date: date | None


class CustomerCategoryStylesResponse(BaseModel):
    summary: CustomerCategoryStylesSummary
    customer_category_matrix: list[CustomerCategoryMatrixEntry]
    customer_rankings: list[CustomerRanking]
    category_rankings: list[CategoryRanking]
    customer_preference_profiles: list[CustomerPreferenceProfile]
    potential_duplicate_styles: list[PotentialDuplicateStyle]
    priority_items: list[CustomerCategoryPriorityItem]


# ── 产品工艺分析（Step 6）───────────────────────────────────────────────────────
# 款式相关统计单位是 inquiry_items；工艺标签统计单位是 inquiry_item_processes。

class ProcessAnalysisSummary(BaseModel):
    total_style_items: int
    items_with_process_description: int
    items_with_process_tags: int
    items_without_process_description: int
    items_without_process_tags: int
    total_process_applications: int
    unique_process_tags: int
    special_process_applications: int
    special_process_share: float       # special_process_applications / total_process_applications


class ProcessRanking(BaseModel):
    process_tag: str
    is_special: bool
    application_count: int
    style_count: int
    customer_count: int
    category_count: int
    quantity_total: int
    average_final_quote: float | None
    average_factory_price: float | None
    average_gross_profit_rate: float | None
    latest_inquiry_date: date | None


class TopProcessBrief(BaseModel):
    process_tag: str
    application_count: int


class ProcessByCategory(BaseModel):
    product_category: str
    style_count: int
    items_with_process_tags: int
    process_coverage_rate: float
    special_process_style_count: int
    special_process_share: float
    top_processes: list[TopProcessBrief]


class ProcessByCustomer(BaseModel):
    customer_code: str | None
    customer_short_name: str
    style_count: int
    process_coverage_rate: float
    special_process_style_count: int
    special_process_share: float
    top_processes: list[TopProcessBrief]


class ProcessRiskSignal(BaseModel):
    signal_type: str
    label: str
    style_count: int
    hint: str


class ProcessPriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    product_name: str | None
    style_no: str | None
    product_category: str | None
    process_description: str | None
    process_tags: list[str]
    missing_fields: list[str]
    risk_hint: str
    inquiry_date: date | None
    order_status: str | None
    quote_status: str | None


class ProcessAnalysisResponse(BaseModel):
    summary: ProcessAnalysisSummary
    process_rankings: list[ProcessRanking]
    special_process_rankings: list[ProcessRanking]
    by_category: list[ProcessByCategory]
    by_customer: list[ProcessByCustomer]
    process_risk_signals: list[ProcessRiskSignal]
    priority_items: list[ProcessPriorityItem]


# ── 尺码范围与尺码偏好分析（Step 7）─────────────────────────────────────────────
# 款式相关统计单位是 inquiry_items；标准化尺码统计单位是 inquiry_item_sizes。

class SizeAnalysisSummary(BaseModel):
    total_style_items: int
    items_with_size_range: int
    items_with_standard_sizes: int
    items_without_size_data: int
    items_with_size_range_but_no_standard_sizes: int
    total_size_applications: int
    unique_size_codes: int
    special_size_applications: int
    special_size_share: float
    wide_span_style_count: int


class SizeRanking(BaseModel):
    size_code: str
    is_special_size: bool
    application_count: int
    style_count: int
    customer_count: int
    category_count: int
    quantity_total: int
    latest_inquiry_date: date | None


class TopSizeBrief(BaseModel):
    size_code: str
    application_count: int


class SizeByCategory(BaseModel):
    product_category: str
    style_count: int
    size_coverage_rate: float
    special_size_style_count: int
    special_size_share: float
    average_size_span_count: float | None
    top_sizes: list[TopSizeBrief]


class SizeByCustomer(BaseModel):
    customer_code: str | None
    customer_short_name: str
    style_count: int
    size_coverage_rate: float
    special_size_style_count: int
    special_size_share: float
    average_size_span_count: float | None
    top_sizes: list[TopSizeBrief]


class SizeSpanBucket(BaseModel):
    span_bucket: str
    style_count: int
    share: float


class SizeRiskSignal(BaseModel):
    signal_type: str
    label: str
    style_count: int
    hint: str


class SizePriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    product_name: str | None
    style_no: str | None
    product_category: str | None
    size_range: str | None
    size_codes: list[str]
    missing_fields: list[str]
    risk_hint: str
    inquiry_date: date | None
    order_status: str | None
    quote_status: str | None


class SizeAnalysisResponse(BaseModel):
    summary: SizeAnalysisSummary
    size_rankings: list[SizeRanking]
    special_size_rankings: list[SizeRanking]
    by_category: list[SizeByCategory]
    by_customer: list[SizeByCustomer]
    size_span_distribution: list[SizeSpanBucket]
    size_risk_signals: list[SizeRiskSignal]
    priority_items: list[SizePriorityItem]


# ── 报价数量 / 订单规模分析（Step 8）───────────────────────────────────────────
# 统计最小单位是 inquiry_items，数量字段统一使用 inquiry_items.quantity。

class QuantityAnalysisSummary(BaseModel):
    total_style_items: int
    items_with_quantity: int
    items_without_quantity: int
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None
    min_quantity: int | None
    max_quantity: int | None
    small_batch_style_count: int
    large_batch_style_count: int


class QuantityDistributionBucket(BaseModel):
    quantity_bucket: str
    style_count: int
    style_share: float
    quantity_total: int
    customer_count: int
    category_count: int


class QuantityByCustomer(BaseModel):
    customer_code: str | None
    customer_short_name: str
    style_count: int
    items_with_quantity: int
    quantity_coverage_rate: float
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None
    top_quantity_bucket: str | None
    small_batch_share: float
    large_batch_share: float


class QuantityByCategory(BaseModel):
    product_category: str
    style_count: int
    quantity_coverage_rate: float
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None
    top_quantity_bucket: str | None
    small_batch_share: float
    large_batch_share: float


class QuantityBySales(BaseModel):
    responsible_sales: str
    style_count: int
    quantity_coverage_rate: float
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None
    top_quantity_bucket: str | None


class QuantityByOrderStatus(BaseModel):
    quote_status: str
    order_status: str
    style_count: int
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None


class QuantityRiskSignal(BaseModel):
    signal_type: str
    label: str
    style_count: int
    hint: str


class QuantityPriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    product_name: str | None
    style_no: str | None
    product_category: str | None
    quantity: int | None
    quantity_bucket: str
    risk_hint: str
    inquiry_date: date | None
    order_status: str | None
    quote_status: str | None


class QuantityAnalysisResponse(BaseModel):
    summary: QuantityAnalysisSummary
    quantity_distribution: list[QuantityDistributionBucket]
    by_customer: list[QuantityByCustomer]
    by_category: list[QuantityByCategory]
    by_sales: list[QuantityBySales]
    by_order_status: list[QuantityByOrderStatus]
    quantity_risk_signals: list[QuantityRiskSignal]
    priority_items: list[QuantityPriorityItem]


# ── 报价单填报人 / 人员维度分析（Step 9）─────────────────────────────────────────
# 统计最小单位是 inquiry_items。本模块所有统计只是工作分布与资料质量展示，
# 不是绩效评价、不打分、不做薪资/奖金计算。

class TopPreparerBrief(BaseModel):
    quote_prepared_by: str
    style_count: int


class PreparerAnalysisSummary(BaseModel):
    total_style_items: int
    items_with_preparer: int
    items_without_preparer: int
    preparer_coverage_rate: float
    unique_preparer_count: int
    top_preparer: TopPreparerBrief | None
    items_where_preparer_differs_from_responsible_sales: int


class PreparerRanking(BaseModel):
    quote_prepared_by: str
    style_count: int
    inquiry_count: int
    customer_count: int
    category_count: int
    quantity_total: int
    average_quantity: float | None
    median_quantity: float | None
    items_with_process_tags: int
    items_with_standard_sizes: int
    data_completeness_rate: float
    responsible_sales_count: int
    latest_inquiry_date: date | None


class PreparerByCustomer(BaseModel):
    quote_prepared_by: str
    customer_code: str | None
    customer_short_name: str
    style_count: int
    category_count: int
    quantity_total: int
    latest_inquiry_date: date | None


class PreparerByCategory(BaseModel):
    quote_prepared_by: str
    product_category: str
    style_count: int
    style_share_in_preparer: float
    quantity_total: int
    average_quantity: float | None


class PreparerByQuantityBucket(BaseModel):
    quote_prepared_by: str
    quantity_bucket: str
    style_count: int
    style_share: float


class PreparerByResponsibleSales(BaseModel):
    responsible_sales: str
    quote_prepared_by: str
    style_count: int
    inquiry_count: int
    same_person: bool


class PreparerDataQualitySignal(BaseModel):
    signal_type: str
    label: str
    style_count: int
    hint: str


class PreparerPriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    quote_prepared_by: str | None
    product_name: str | None
    style_no: str | None
    product_category: str | None
    quantity: int | None
    inquiry_date: date | None
    quote_status: str | None
    order_status: str | None
    missing_fields: list[str]
    risk_hint: str


class PreparerAnalysisResponse(BaseModel):
    summary: PreparerAnalysisSummary
    preparer_rankings: list[PreparerRanking]
    by_customer: list[PreparerByCustomer]
    by_category: list[PreparerByCategory]
    by_quantity_bucket: list[PreparerByQuantityBucket]
    by_responsible_sales: list[PreparerByResponsibleSales]
    data_quality_signals: list[PreparerDataQualitySignal]
    priority_items: list[PreparerPriorityItem]


# ── 报价资料分析总览（统一入口）─────────────────────────────────────────────────
# 本模块不重新统计，全部数值来自调用 Step 4-9 六个分析接口本体函数后的结果，
# 只做汇总展示与跳转，保证与各细分页面口径完全一致。

class OverviewSummary(BaseModel):
    total_style_items: int
    overall_completeness_rate: float
    items_needing_completion: int
    customer_count: int
    category_count: int
    unique_process_tags: int
    unique_size_codes: int
    items_with_quantity: int
    items_with_quote_preparer: int


class KeyGap(BaseModel):
    field_key: str
    field_label: str
    missing_count: int
    coverage_rate: float
    priority_level: str       # high | medium | low
    target_module: str


class CustomerCategoryHighlight(BaseModel):
    customer_code: str | None
    customer_short_name: str
    top_category: str | None
    style_count: int
    top_category_share: float | None
    target_module: str


class ProcessHighlight(BaseModel):
    process_tag: str
    is_special: bool
    application_count: int
    customer_count: int
    target_module: str


class SizeHighlight(BaseModel):
    size_code: str
    is_special_size: bool
    application_count: int
    customer_count: int
    target_module: str


class QuantityHighlight(BaseModel):
    top_quantity_bucket: str | None
    small_batch_style_count: int
    large_batch_style_count: int
    items_without_quantity: int
    target_module: str


class PreparerHighlight(BaseModel):
    items_with_preparer: int
    items_without_preparer: int
    preparer_coverage_rate: float
    top_preparer: str | None
    top_preparer_style_count: int | None
    target_module: str


class OverviewPriorityItem(BaseModel):
    inquiry_id: str
    inquiry_no: str
    item_id: str
    customer_short_name: str | None
    responsible_sales: str | None
    product_name: str | None
    style_no: str | None
    missing_fields: list[str]
    risk_hint: str
    inquiry_date: date | None


class ModuleLink(BaseModel):
    label: str
    target_module: str


class QuoteAnalysisOverviewResponse(BaseModel):
    summary: OverviewSummary
    key_gaps: list[KeyGap]
    top_customer_categories: list[CustomerCategoryHighlight]
    top_processes: list[ProcessHighlight]
    top_sizes: list[SizeHighlight]
    quantity_distribution_highlights: list[QuantityHighlight]
    preparer_highlights: list[PreparerHighlight]
    priority_items: list[OverviewPriorityItem]
    module_links: list[ModuleLink]
