"""
数据分析接口
所有接口均支持可选的 year 参数；Python 层聚合，适合 MVP 数据量。
所有接口均根据当前用户角色限定数据范围。
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import date as date_type
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import UserDep, apply_inquiry_scope
from app.database import get_db
from app.models import ImportBatch, Inquiry, User
from app.models.inquiry_item import InquiryItem
from app.schemas.analytics import (
    CategoryQualityStat,
    CategoryRanking,
    CustomerCategoryMatrixEntry,
    CustomerCategoryPriorityItem,
    CustomerCategoryStylesResponse,
    CustomerCategoryStylesSummary,
    CustomerPreferenceProfile,
    CustomerQualityStat,
    CustomerRanking,
    CustomerStat,
    DashboardStats,
    FieldCoverage,
    GroupStat,
    ImportBatchQualityStat,
    PotentialDuplicateStyle,
    PreferenceCategoryEntry,
    PriorityItem,
    ProcessAnalysisResponse,
    ProcessAnalysisSummary,
    ProcessByCategory,
    ProcessByCustomer,
    ProcessPriorityItem,
    ProcessRanking,
    ProcessRiskSignal,
    CustomerCategoryHighlight,
    KeyGap,
    ModuleLink,
    OverviewPriorityItem,
    OverviewSummary,
    PreparerAnalysisResponse,
    PreparerAnalysisSummary,
    PreparerByCategory,
    PreparerByCustomer,
    PreparerByQuantityBucket,
    PreparerByResponsibleSales,
    PreparerDataQualitySignal,
    PreparerHighlight,
    PreparerPriorityItem,
    PreparerRanking,
    ProcessHighlight,
    ProductStat,
    QuantityAnalysisResponse,
    QuantityHighlight,
    QuantityAnalysisSummary,
    QuantityByCategory,
    QuantityByCustomer,
    QuantityByOrderStatus,
    QuantityBySales,
    QuantityDistributionBucket,
    QuantityPriorityItem,
    QuantityRiskSignal,
    QuarterStat,
    QuoteAnalysisOverviewResponse,
    QuoteDataQualityResponse,
    QuoteDataQualitySummary,
    SalesQualityStat,
    SalesStat,
    SizeAnalysisResponse,
    SizeHighlight,
    SizeAnalysisSummary,
    SizeByCategory,
    SizeByCustomer,
    SizePriorityItem,
    SizeRanking,
    SizeRiskSignal,
    SizeSpanBucket,
    TopCategoryBrief,
    TopCustomerBrief,
    TopPreparerBrief,
    TopProcessBrief,
    TopSizeBrief,
)
from app.services.customer_category_analysis_service import (
    customer_identity,
    effective_category,
    missing_analysis_fields,
    preference_notes,
    preference_type,
    priority_sort_key as cc_priority_sort_key,
    style_identity,
)
from app.services.process_analysis_service import (
    avg_or_none,
    fetch_delayed_production_inquiry_ids,
    fetch_overdue_sample_inquiry_ids,
    has_description,
    has_tags,
    missing_process_fields,
    mode_value,
    normalize_tag_key,
    priority_sort_key as pa_priority_sort_key,
    priority_tier,
    risk_hint as pa_risk_hint,
)
from app.services.quantity_analysis_service import (
    BUCKET_ORDER,
    P95_MIN_SAMPLE,
    avg_or_none as qa_avg_or_none,
    has_priority_status as qa_has_priority_status,
    is_large_batch,
    is_priority_candidate as qa_is_priority_candidate,
    is_small_batch,
    median_or_none,
    mode_value as qa_mode_value,
    percentile_or_none,
    priority_sort_key as qa_priority_sort_key,
    priority_tier as qa_priority_tier,
    quantity_bucket,
    risk_hint as qa_risk_hint,
)
from app.services.quote_analysis_overview_service import (
    MODULE_LINKS,
    overview_priority_sort_key,
    priority_level,
)
from app.services.quote_data_quality_service import (
    FIELD_DEFS,
    ORDER_PRIORITY_STATUSES,
    QUOTE_PRIORITY_STATUSES,
    classify_item,
    field_filled,
    has_priority_status,
    missing_key_fields,
    priority_sort_key,
)
from app.services.quote_preparer_analysis_service import (
    LOW_COMPLETENESS_MIN_STYLE_COUNT,
    LOW_COMPLETENESS_THRESHOLD,
    ORDER_PRIORITY_STATUSES as QP_ORDER_PRIORITY_STATUSES,
    QUOTE_PRIORITY_STATUSES as QP_QUOTE_PRIORITY_STATUSES,
    differs_from_responsible_sales,
    has_preparer,
    is_priority_candidate as qp_is_priority_candidate,
    mode_value as qp_mode_value,
    normalize_preparer,
    preparer_label,
    priority_sort_key as qp_priority_sort_key,
    priority_tier as qp_priority_tier,
    risk_hint as qp_risk_hint,
)
from app.services.size_analysis_service import (
    avg_or_none as sa_avg_or_none,
    fetch_delayed_production_inquiry_ids as sa_fetch_delayed_production_inquiry_ids,
    fetch_overdue_sample_inquiry_ids as sa_fetch_overdue_sample_inquiry_ids,
    has_size_range,
    has_standard_sizes,
    is_priority_candidate as sz_is_priority_candidate,
    missing_size_fields,
    mode_value as sa_mode_value,
    normalize_size_key,
    priority_sort_key as sz_priority_sort_key,
    priority_tier as sz_priority_tier,
    risk_hint as sz_risk_hint,
    size_span_count,
    span_bucket,
    SPAN_BUCKETS,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

MONTH_TO_QUARTER = {
    "Jan": 1, "Feb": 1, "Mar": 1,
    "Apr": 2, "May": 2, "Jun": 2,
    "Jul": 3, "Aug": 3, "Sep": 3,
    "Oct": 4, "Nov": 4, "Dec": 4,
}


async def _load(db: AsyncSession, year: int | None, user: User) -> list[Inquiry]:
    q = select(Inquiry)
    if year:
        q = q.where(Inquiry.inquiry_year == year)
    q = apply_inquiry_scope(q, user)
    return list((await db.execute(q)).scalars().all())


def _pct(ordered: int, total: int) -> float:
    return round(ordered / total * 100, 1) if total else 0.0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """首页核心指标"""
    rows = await _load(db, year, user)
    total = len(rows)
    quoted = sum(
        1 for r in rows
        if r.quote_status and r.quote_status not in ("未报价", "")
    )
    ordered = sum(1 for r in rows if r.order_status == "下单")
    trade = sum(float(r.trade_amount or 0) for r in rows if r.order_status == "下单")
    gp_vals = [float(r.gross_profit_rate) for r in rows if r.gross_profit_rate is not None]

    return DashboardStats(
        total_inquiries=total,
        total_quoted=quoted,
        total_ordered=ordered,
        conversion_rate=_pct(ordered, total),
        total_trade_amount=trade,
        avg_gross_profit_rate=_avg(gp_vals),
    )


# ── 业务员分析 ─────────────────────────────────────────────────────────────────

@router.get("/sales", response_model=list[SalesStat])
async def sales_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按负责业务员汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0, order_trades=[], gp=[])
    )
    for r in rows:
        key = r.responsible_sales or "未知"
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            amt = float(r.trade_amount or 0)
            s["trade"] += amt
            if r.trade_amount:
                s["order_trades"].append(amt)
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    result = []
    for name, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"]):
        result.append(SalesStat(
            responsible_sales=name,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_trade_amount=round(s["trade"] / s["ordered"], 2) if s["ordered"] else 0.0,
            avg_gross_profit_rate=_avg(s["gp"]),
        ))
    return result


# ── 客户分析 ──────────────────────────────────────────────────────────────────

@router.get("/customers", response_model=list[CustomerStat])
async def customers_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按客户（customer_short_name 或 customer_code）汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(lambda: dict(
        customer_code=None,
        customer_short_name=None,
        inquiry=0, ordered=0,
        trade=0.0, order_trades=[],
        inquiry_dates=[], order_dates=[],
        ordered_cats=[], ordered_series=[],
    ))

    for r in rows:
        key = r.customer_short_name or r.customer_code or "未知"
        s = stats[key]
        s["customer_code"] = s["customer_code"] or r.customer_code
        s["customer_short_name"] = s["customer_short_name"] or r.customer_short_name
        s["inquiry"] += 1
        if r.inquiry_date:
            s["inquiry_dates"].append(r.inquiry_date)
        if r.order_status == "下单":
            s["ordered"] += 1
            amt = float(r.trade_amount or 0)
            s["trade"] += amt
            if r.trade_amount:
                s["order_trades"].append(amt)
            if r.order_date:
                s["order_dates"].append(r.order_date)
            if r.product_category:
                s["ordered_cats"].append(r.product_category)
            if r.series_name:
                s["ordered_series"].append(r.series_name)

    result = []
    for _key, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"]):
        top_cat = Counter(s["ordered_cats"]).most_common(1)
        top_ser = Counter(s["ordered_series"]).most_common(1)
        result.append(CustomerStat(
            customer_code=s["customer_code"],
            customer_short_name=s["customer_short_name"] or _key,
            inquiry_count=s["inquiry"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_order_amount=round(s["trade"] / s["ordered"], 2) if s["ordered"] else 0.0,
            last_inquiry_date=max(s["inquiry_dates"]) if s["inquiry_dates"] else None,
            last_order_date=max(s["order_dates"]) if s["order_dates"] else None,
            top_product_category=top_cat[0][0] if top_cat else None,
            top_series=top_ser[0][0] if top_ser else None,
        ))
    return result


# ── 小组分析 ──────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[GroupStat])
async def groups_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按业务小组汇总"""
    rows = await _load(db, year, user)

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0, gp=[])
    )
    for r in rows:
        key = r.group_name or "未知"
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    return [
        GroupStat(
            group_name=name,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            avg_gross_profit_rate=_avg(s["gp"]),
        )
        for name, s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"])
    ]


# ── 产品/系列分析 ──────────────────────────────────────────────────────────────

@router.get("/products", response_model=list[ProductStat])
async def products_analysis(db: DbDep, user: UserDep, year: int | None = Query(None)):
    """按产品大类 + 系列汇总"""
    rows = await _load(db, year, user)

    stats: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, ordered=0, qty=0, trade=0.0, quotes=[], gp=[])
    )
    for r in rows:
        cat = r.product_category or "未知"
        ser = r.series_name or ""
        key = (cat, ser)
        s = stats[key]
        s["inquiry"] += 1
        s["qty"] += int(r.quantity or 0)
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)
        if r.final_quote is not None:
            s["quotes"].append(float(r.final_quote))
        if r.gross_profit_rate is not None:
            s["gp"].append(float(r.gross_profit_rate))

    return [
        ProductStat(
            product_category=cat,
            series_name=ser,
            inquiry_count=s["inquiry"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_quantity=s["qty"],
            total_trade_amount=s["trade"],
            avg_final_quote=_avg(s["quotes"]),
            avg_gross_profit_rate=_avg(s["gp"]),
        )
        for (cat, ser), s in sorted(stats.items(), key=lambda x: -x[1]["inquiry"])
    ]


# ── 季度分析 ──────────────────────────────────────────────────────────────────

@router.get("/quarters", response_model=list[QuarterStat])
async def quarters_analysis(db: DbDep, user: UserDep):
    """按年份+季度汇总，含 QoQ 对比"""
    rows = await _load(db, year=None, user=user)

    stats: dict[tuple[int, int], dict[str, Any]] = defaultdict(
        lambda: dict(inquiry=0, quoted=0, ordered=0, trade=0.0)
    )
    for r in rows:
        if not r.inquiry_year or not r.inquiry_month:
            continue
        q = MONTH_TO_QUARTER.get(r.inquiry_month)
        if q is None:
            continue
        key = (r.inquiry_year, q)
        s = stats[key]
        s["inquiry"] += 1
        if r.quote_status and r.quote_status not in ("未报价", ""):
            s["quoted"] += 1
        if r.order_status == "下单":
            s["ordered"] += 1
            s["trade"] += float(r.trade_amount or 0)

    ordered_keys = sorted(stats.keys())

    result: list[QuarterStat] = []
    for i, (year, quarter) in enumerate(ordered_keys):
        s = stats[(year, quarter)]
        prev_trade: float | None = None
        change_pct: float | None = None

        if i > 0:
            py, pq = ordered_keys[i - 1]
            prev_s = stats[(py, pq)]
            prev_trade = prev_s["trade"]
            if prev_trade and prev_trade > 0:
                change_pct = round((s["trade"] - prev_trade) / prev_trade * 100, 1)

        season_type = "SS" if quarter in (1, 2) else "FW/AW"
        result.append(QuarterStat(
            year=year,
            quarter=quarter,
            quarter_label=f"{year} Q{quarter}",
            season_type=season_type,
            inquiry_count=s["inquiry"],
            quoted_count=s["quoted"],
            ordered_count=s["ordered"],
            conversion_rate=_pct(s["ordered"], s["inquiry"]),
            total_trade_amount=s["trade"],
            prev_quarter_trade=prev_trade,
            trade_change_pct=change_pct,
        ))

    result.reverse()
    return result


# ── 报价资料数据完整度（Step 4）─────────────────────────────────────────────────

@router.get("/quote-data-quality", response_model=QuoteDataQualityResponse)
async def quote_data_quality(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按款式自身的产品品类筛选"),
    import_batch_id: str | None = Query(None, description="按询单的导入批次筛选"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
):
    """
    报价资料数据完整度看板。统计单位是 inquiry_items（款式明细），权限范围
    复用 apply_inquiry_scope（与其它 analytics 接口一致：admin 全公司，
    group_leader/viewer 限本组，sales 限自己负责或协助的询单）。
    """
    q = (
        select(InquiryItem)
        .join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
        .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
    )
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if product_category:
        q = q.where(InquiryItem.product_category == product_category)
    if import_batch_id:
        q = q.where(Inquiry.import_batch_id == import_batch_id)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)

    items = list((await db.execute(q)).scalars().unique().all())

    # 同一批查出每个 item 所属的 inquiry（用于分组/优先级），避免逐条触发懒加载
    inq_ids = {it.inquiry_id for it in items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    batch_ids = {inq.import_batch_id for inq in inquiries.values() if inq.import_batch_id}
    batches: dict[Any, ImportBatch] = {}
    if batch_ids:
        batch_rows = (await db.execute(select(ImportBatch).where(ImportBatch.id.in_(batch_ids)))).scalars().all()
        batches = {b.id: b for b in batch_rows}

    total = len(items)

    # ── 总览 + 字段覆盖率 ────────────────────────────────────────────────────
    level_counts = {"complete": 0, "partial": 0, "high_missing": 0}
    field_filled_counts: dict[str, int] = {k: 0 for k, _ in FIELD_DEFS}

    for it in items:
        level_counts[classify_item(it)] += 1
        for key, _label in FIELD_DEFS:
            if field_filled(it, key):
                field_filled_counts[key] += 1

    summary = QuoteDataQualitySummary(
        total_inquiry_items=total,
        complete_items=level_counts["complete"],
        partially_complete_items=level_counts["partial"],
        high_missing_items=level_counts["high_missing"],
        overall_completeness_rate=round(level_counts["complete"] / total, 4) if total else 0.0,
    )

    field_coverage = [
        FieldCoverage(
            field_key=key,
            field_label=label,
            filled_count=field_filled_counts[key],
            missing_count=total - field_filled_counts[key],
            coverage_rate=round(field_filled_counts[key] / total, 4) if total else 0.0,
        )
        for key, label in FIELD_DEFS
    ]

    # ── 分组统计：按客户 ──────────────────────────────────────────────────────
    customer_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "customer_code": None, "customer_short_name": None, "items": [],
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        key = (inq.customer_short_name if inq else None) or (inq.customer_code if inq else None) or "未知"
        g = customer_groups[key]
        g["customer_code"] = g["customer_code"] or (inq.customer_code if inq else None)
        g["customer_short_name"] = g["customer_short_name"] or (inq.customer_short_name if inq else None) or key
        g["items"].append(it)

    by_customer = []
    for key, g in sorted(customer_groups.items(), key=lambda x: -len(x[1]["items"])):
        its = g["items"]
        n = len(its)
        complete_n = sum(1 for it in its if classify_item(it) == "complete")
        by_customer.append(CustomerQualityStat(
            customer_code=g["customer_code"],
            customer_short_name=g["customer_short_name"],
            total_items=n,
            completeness_rate=round(complete_n / n, 4) if n else 0.0,
            missing_style_no_count=sum(1 for it in its if not field_filled(it, "style_no")),
            missing_process_count=sum(
                1 for it in its
                if not (field_filled(it, "process_description") or field_filled(it, "processes"))
            ),
            missing_size_count=sum(
                1 for it in its
                if not (field_filled(it, "size_range") or field_filled(it, "sizes"))
            ),
            missing_preparer_count=sum(1 for it in its if not field_filled(it, "quote_prepared_by")),
            high_missing_count=sum(1 for it in its if classify_item(it) == "high_missing"),
        ))

    # ── 分组统计：按负责业务员（responsible_sales，不是 quote_prepared_by）──────
    sales_groups: dict[str, list[InquiryItem]] = defaultdict(list)
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        key = (inq.responsible_sales if inq else None) or "未知"
        sales_groups[key].append(it)

    by_sales = []
    for name, its in sorted(sales_groups.items(), key=lambda x: -len(x[1])):
        n = len(its)
        complete_n = sum(1 for it in its if classify_item(it) == "complete")
        by_sales.append(SalesQualityStat(
            responsible_sales=name,
            total_items=n,
            completeness_rate=round(complete_n / n, 4) if n else 0.0,
            missing_field_count=sum(len(missing_key_fields(it)) for it in its),
            high_missing_count=sum(1 for it in its if classify_item(it) == "high_missing"),
        ))

    # ── 分组统计：按产品品类（款式自身字段）────────────────────────────────────
    category_groups: dict[str, list[InquiryItem]] = defaultdict(list)
    for it in items:
        key = it.product_category if field_filled(it, "product_category") else "未填写"
        category_groups[key].append(it)

    by_category = []
    for cat, its in sorted(category_groups.items(), key=lambda x: -len(x[1])):
        n = len(its)
        complete_n = sum(1 for it in its if classify_item(it) == "complete")
        by_category.append(CategoryQualityStat(
            product_category=cat,
            total_items=n,
            completeness_rate=round(complete_n / n, 4) if n else 0.0,
            missing_process_count=sum(
                1 for it in its
                if not (field_filled(it, "process_description") or field_filled(it, "processes"))
            ),
            missing_size_count=sum(
                1 for it in its
                if not (field_filled(it, "size_range") or field_filled(it, "sizes"))
            ),
            missing_style_no_count=sum(1 for it in its if not field_filled(it, "style_no")),
        ))

    # ── 分组统计：按导入批次 ─────────────────────────────────────────────────
    # 已知限制：inquiry_items 没有自己的 import_batch_id，这里按"款式所属询单的
    # 导入批次"分组，详见 quote_data_quality_service 模块顶部说明。
    batch_groups: dict[Any, list[InquiryItem]] = defaultdict(list)
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        batch_key = inq.import_batch_id if (inq and inq.import_batch_id) else None
        batch_groups[batch_key].append(it)

    by_import_batch = []
    for batch_key, its in sorted(batch_groups.items(), key=lambda x: -len(x[1])):
        n = len(its)
        complete_n = sum(1 for it in its if classify_item(it) == "complete")
        batch = batches.get(batch_key) if batch_key else None
        by_import_batch.append(ImportBatchQualityStat(
            import_batch_id=str(batch_key) if batch_key else None,
            file_name=batch.file_name if batch else None,
            uploaded_at=batch.uploaded_at.isoformat() if batch and batch.uploaded_at else None,
            total_items=n,
            completeness_rate=round(complete_n / n, 4) if n else 0.0,
            missing_field_count=sum(len(missing_key_fields(it)) for it in its),
        ))

    # ── 优先补录清单 ─────────────────────────────────────────────────────────
    candidates = []
    for it in items:
        missing = missing_key_fields(it)
        if not missing:
            continue
        inq = inquiries.get(it.inquiry_id)
        level = classify_item(it)
        candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "responsible_sales": inq.responsible_sales if inq else None,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "missing_fields": missing,
            "missing_field_count": len(missing),
            "completeness_level": level,
            "inquiry_date": inq.inquiry_date if inq else None,
            "order_status": inq.order_status if inq else None,
            "quote_status": inq.quote_status if inq else None,
            "_has_priority_status": has_priority_status(inq) if inq else False,
            "_updated_at": it.updated_at,
        })

    candidates.sort(key=priority_sort_key, reverse=True)

    priority_items = [
        PriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            product_name=c["product_name"], style_no=c["style_no"],
            missing_fields=c["missing_fields"], missing_field_count=c["missing_field_count"],
            completeness_level=c["completeness_level"], inquiry_date=c["inquiry_date"],
            order_status=c["order_status"], quote_status=c["quote_status"],
        )
        for c in candidates
    ]

    return QuoteDataQualityResponse(
        summary=summary,
        field_coverage=field_coverage,
        by_customer=by_customer,
        by_sales=by_sales,
        by_category=by_category,
        by_import_batch=by_import_batch,
        priority_items=priority_items,
    )


# ── 客户 × 品类 × 款式分析（Step 5）─────────────────────────────────────────────

@router.get("/customer-category-styles", response_model=CustomerCategoryStylesResponse)
async def customer_category_styles(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按有效品类筛选（item 级为空退化用询单级）"),
    series_name: str | None = Query(None, description="按款式系列筛选（item 级字段，精确匹配）"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
    min_style_count: int | None = Query(None, ge=1, description="过滤掉款式数低于该阈值的客户/品类分组（仅影响矩阵和排名，不影响总览/偏好画像/重复款/缺失资料清单）"),
):
    """
    客户 × 品类 × 款式分析。统计单位是 inquiry_items（款式明细），权限范围
    复用 apply_inquiry_scope。口径详见 customer_category_analysis_service
    模块顶部说明（款式识别 / 客户识别 / 品类识别的退化规则）。
    """
    q = select(InquiryItem).join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if series_name:
        q = q.where(InquiryItem.series_name == series_name)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)

    items = list((await db.execute(q)).scalars().unique().all())

    inq_ids = {it.inquiry_id for it in items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    # ── 逐条解析有效品类 / 客户 / 款式身份；品类有退化规则，不能直接下推到 SQL ──
    rows: list[dict[str, Any]] = []
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        if product_category and category != product_category:
            continue
        cust_key, cust_code, cust_label = customer_identity(inq)
        style_key, style_known, _label = style_identity(it)
        rows.append({
            "item": it, "inquiry": inq, "category": category,
            "cust_key": cust_key, "cust_code": cust_code, "cust_label": cust_label,
            "style_key": style_key, "style_known": style_known,
            "quantity": int(it.quantity or 0),
        })

    total_items = len(rows)
    known_count = sum(1 for r in rows if r["style_known"])
    unknown_count = total_items - known_count

    # ── 客户 × 品类矩阵 ───────────────────────────────────────────────────────
    matrix_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None,
        "styles": set(), "item_count": 0, "unknown_count": 0,
        "quantity_total": 0, "dates": [],
    })
    for r in rows:
        g = matrix_groups[(r["cust_key"], r["category"])]
        g["cust_code"] = g["cust_code"] or r["cust_code"]
        g["cust_label"] = g["cust_label"] or r["cust_label"]
        g["styles"].add(r["style_key"])
        g["item_count"] += 1
        if not r["style_known"]:
            g["unknown_count"] += 1
        g["quantity_total"] += r["quantity"]
        if r["inquiry"] and r["inquiry"].inquiry_date:
            g["dates"].append(r["inquiry"].inquiry_date)

    # ── 客户汇总（跨品类），从矩阵分组派生，避免重复遍历口径不一致 ──────────────
    customer_totals: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None, "styles": set(),
        "category_styles": Counter(), "quantity_total": 0, "dates": [],
    })
    category_totals: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "style_count": 0, "customers": set(), "quantity_total": 0,
        "dates": [], "customer_styles": Counter(),
    })
    for (cust_key, category), g in matrix_groups.items():
        style_count = len(g["styles"])

        ct = customer_totals[cust_key]
        ct["cust_code"] = ct["cust_code"] or g["cust_code"]
        ct["cust_label"] = ct["cust_label"] or g["cust_label"]
        ct["styles"] |= g["styles"]
        ct["category_styles"][category] = style_count
        ct["quantity_total"] += g["quantity_total"]
        ct["dates"].extend(g["dates"])

        ctg = category_totals[category]
        ctg["style_count"] += style_count
        ctg["customers"].add(cust_key)
        ctg["quantity_total"] += g["quantity_total"]
        ctg["dates"].extend(g["dates"])
        ctg["customer_styles"][g["cust_label"]] += style_count

    # ── 总览：基于未经 min_style_count 过滤的完整数据计算 ───────────────────────
    total_customers = len(customer_totals)
    total_categories = len(category_totals)

    top_customer_by_styles = None
    if customer_totals:
        _key, best = max(customer_totals.items(), key=lambda kv: len(kv[1]["styles"]))
        top_customer_by_styles = TopCustomerBrief(
            customer_code=best["cust_code"], customer_short_name=best["cust_label"],
            style_count=len(best["styles"]),
        )
    top_category_by_styles = None
    if category_totals:
        cat_name, best_cat = max(category_totals.items(), key=lambda kv: kv[1]["style_count"])
        top_category_by_styles = TopCategoryBrief(product_category=cat_name, style_count=best_cat["style_count"])

    summary = CustomerCategoryStylesSummary(
        total_customers=total_customers,
        total_categories=total_categories,
        total_style_items=total_items,
        known_style_count=known_count,
        unknown_style_count=unknown_count,
        top_customer_by_styles=top_customer_by_styles,
        top_category_by_styles=top_category_by_styles,
    )

    # ── 矩阵输出（min_style_count 仅影响矩阵 / 排名展示，不影响总览口径）────────
    customer_category_matrix: list[CustomerCategoryMatrixEntry] = []
    for (cust_key, category), g in matrix_groups.items():
        style_count = len(g["styles"])
        if min_style_count and style_count < min_style_count:
            continue
        cust_total_styles = len(customer_totals[cust_key]["styles"]) or 1
        customer_category_matrix.append(CustomerCategoryMatrixEntry(
            customer_code=g["cust_code"],
            customer_short_name=g["cust_label"],
            product_category=category,
            style_count=style_count,
            item_count=g["item_count"],
            unique_style_count=style_count,
            unknown_style_count=g["unknown_count"],
            quantity_total=g["quantity_total"],
            style_share_in_customer=round(style_count / cust_total_styles, 4),
            latest_inquiry_date=max(g["dates"]) if g["dates"] else None,
        ))
    customer_category_matrix.sort(key=lambda e: -e.style_count)

    # ── 客户排名 ─────────────────────────────────────────────────────────────
    customer_rankings: list[CustomerRanking] = []
    for cust_key, ct in customer_totals.items():
        style_count = len(ct["styles"])
        if min_style_count and style_count < min_style_count:
            continue
        top_cat, top_cat_count = (ct["category_styles"].most_common(1) or [(None, 0)])[0]
        customer_rankings.append(CustomerRanking(
            customer_code=ct["cust_code"],
            customer_short_name=ct["cust_label"],
            style_count=style_count,
            category_count=len(ct["category_styles"]),
            top_category=top_cat,
            top_category_share=round(top_cat_count / style_count, 4) if style_count else None,
            quantity_total=ct["quantity_total"],
            latest_inquiry_date=max(ct["dates"]) if ct["dates"] else None,
        ))
    customer_rankings.sort(key=lambda e: -e.style_count)

    # ── 品类排名 ─────────────────────────────────────────────────────────────
    category_rankings: list[CategoryRanking] = []
    for category, ctg in category_totals.items():
        if min_style_count and ctg["style_count"] < min_style_count:
            continue
        top_customer = (ctg["customer_styles"].most_common(1) or [(None, 0)])[0][0]
        category_rankings.append(CategoryRanking(
            product_category=category,
            style_count=ctg["style_count"],
            customer_count=len(ctg["customers"]),
            quantity_total=ctg["quantity_total"],
            top_customer=top_customer,
            latest_inquiry_date=max(ctg["dates"]) if ctg["dates"] else None,
        ))
    category_rankings.sort(key=lambda e: -e.style_count)

    # ── 客户偏好画像（不受 min_style_count 影响，小样本走"样本不足"分支）──────────
    customer_preference_profiles: list[CustomerPreferenceProfile] = []
    for _cust_key, ct in customer_totals.items():
        total = len(ct["styles"])
        top_list = ct["category_styles"].most_common(3)
        primary = [
            PreferenceCategoryEntry(
                product_category=cat, style_count=cnt,
                share=round(cnt / total, 4) if total else 0.0,
            )
            for cat, cnt in top_list
        ]
        top1_share = primary[0].share if primary else 0.0
        pref_type = preference_type(total, top1_share, len(ct["category_styles"]))
        notes = preference_notes(
            ct["cust_label"], [p.model_dump() for p in primary], pref_type,
        )
        customer_preference_profiles.append(CustomerPreferenceProfile(
            customer_code=ct["cust_code"],
            customer_short_name=ct["cust_label"],
            total_style_count=total,
            primary_categories=primary,
            preference_type=pref_type,
            notes=notes,
        ))
    customer_preference_profiles.sort(key=lambda e: -e.total_style_count)

    # ── 潜在重复款（同客户下相同款式身份出现多次；只是风险提示，不自动合并）──────
    dup_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None, "product_name": None, "series_name": None,
        "inquiry_nos": set(), "item_ids": [],
    })
    for r in rows:
        if not r["style_known"]:
            continue
        d = dup_groups[(r["cust_key"], r["style_key"])]
        d["cust_code"] = d["cust_code"] or r["cust_code"]
        d["cust_label"] = d["cust_label"] or r["cust_label"]
        d["product_name"] = d["product_name"] or r["item"].product_name
        d["series_name"] = d["series_name"] or r["item"].series_name
        if r["inquiry"]:
            d["inquiry_nos"].add(r["inquiry"].inquiry_no)
        d["item_ids"].append(str(r["item"].id))

    potential_duplicate_styles: list[PotentialDuplicateStyle] = []
    for (_cust_key, style_key), d in dup_groups.items():
        if len(d["item_ids"]) < 2:
            continue
        display_key = style_key.partition(":")[2].split("|")[0]
        potential_duplicate_styles.append(PotentialDuplicateStyle(
            customer_code=d["cust_code"],
            customer_short_name=d["cust_label"],
            style_key=display_key,
            product_name=d["product_name"],
            series_name=d["series_name"],
            duplicate_count=len(d["item_ids"]),
            inquiry_nos=sorted(d["inquiry_nos"]),
            item_ids=d["item_ids"],
        ))
    potential_duplicate_styles.sort(key=lambda e: -e.duplicate_count)

    # ── 影响分析准确性的缺失资料清单 ─────────────────────────────────────────────
    priority_candidates = []
    for r in rows:
        missing = missing_analysis_fields(r["cust_key"], r["category"], r["style_known"])
        if not missing:
            continue
        it, inq = r["item"], r["inquiry"]
        priority_candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "product_category": it.product_category,
            "missing_fields": missing,
            "missing_field_count": len(missing),
            "impact": "会影响客户品类款式统计",
            "inquiry_date": inq.inquiry_date if inq else None,
            "_updated_at": it.updated_at,
        })
    priority_candidates.sort(key=cc_priority_sort_key, reverse=True)

    priority_items = [
        CustomerCategoryPriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], product_name=c["product_name"],
            style_no=c["style_no"], product_category=c["product_category"],
            missing_fields=c["missing_fields"], impact=c["impact"], inquiry_date=c["inquiry_date"],
        )
        for c in priority_candidates
    ]

    return CustomerCategoryStylesResponse(
        summary=summary,
        customer_category_matrix=customer_category_matrix,
        customer_rankings=customer_rankings,
        category_rankings=category_rankings,
        customer_preference_profiles=customer_preference_profiles,
        potential_duplicate_styles=potential_duplicate_styles,
        priority_items=priority_items,
    )


# ── 产品工艺分析（Step 6）───────────────────────────────────────────────────────

@router.get("/processes", response_model=ProcessAnalysisResponse)
async def process_analysis(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按有效品类筛选（item 级为空退化用询单级）"),
    series_name: str | None = Query(None, description="按款式系列筛选（item 级字段，精确匹配）"),
    process_tag: str | None = Query(None, description="按工艺标签筛选（大小写不敏感），命中即保留该款式的全部统计"),
    is_special: bool | None = Query(None, description="按是否特殊工艺筛选（命中即保留该款式的全部统计）"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
    min_usage_count: int | None = Query(None, ge=1, description="过滤掉应用次数低于该阈值的工艺标签（仅影响排名/品类客户内的 top_processes 展示，不影响总览）"),
):
    """
    产品工艺分析。款式相关统计单位是 inquiry_items，工艺标签统计单位是
    inquiry_item_processes。权限范围复用 apply_inquiry_scope。口径详见
    process_analysis_service 模块顶部说明（工艺缺失三态 / 特殊工艺口径 /
    风险信号的询单级近似限制）。
    """
    q = (
        select(InquiryItem)
        .join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
        .options(selectinload(InquiryItem.processes))
    )
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if series_name:
        q = q.where(InquiryItem.series_name == series_name)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)

    raw_items = list((await db.execute(q)).scalars().unique().all())

    inq_ids = {it.inquiry_id for it in raw_items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    # ── 有效品类 / 工艺标签 / 是否特殊 过滤（有退化规则，不能直接下推到 SQL）────
    def _matches_process_filter(it: InquiryItem) -> bool:
        if process_tag is None and is_special is None:
            return True
        target_key = normalize_tag_key(process_tag) if process_tag else None
        for p in it.processes:
            if target_key is not None and normalize_tag_key(p.process_tag) != target_key:
                continue
            if is_special is not None and p.is_special != is_special:
                continue
            return True
        return False

    items: list[InquiryItem] = []
    for it in raw_items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        if product_category and category != product_category:
            continue
        if not _matches_process_filter(it):
            continue
        items.append(it)

    total_items = len(items)

    # ── 总览：缺原始说明 / 有说明缺标签 / 有标签 三态互斥统计 ───────────────────
    with_desc = sum(1 for it in items if has_description(it))
    with_tags = sum(1 for it in items if has_tags(it))
    total_applications = sum(len(it.processes) for it in items)
    special_applications = sum(1 for it in items for p in it.processes if p.is_special)

    summary = ProcessAnalysisSummary(
        total_style_items=total_items,
        items_with_process_description=with_desc,
        items_with_process_tags=with_tags,
        items_without_process_description=total_items - with_desc,
        items_without_process_tags=total_items - with_tags,
        total_process_applications=total_applications,
        unique_process_tags=len({normalize_tag_key(p.process_tag) for it in items for p in it.processes}),
        special_process_applications=special_applications,
        special_process_share=round(special_applications / total_applications, 4) if total_applications else 0.0,
    )

    # ── 工艺标签分组（按 tag 归并 key，跨款式聚合）──────────────────────────────
    tag_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "labels": Counter(), "specials": Counter(), "item_ids": set(),
        "customers": set(), "categories": set(), "quantity_total": 0,
        "quotes": [], "factory_prices": [], "gp_rates": [], "dates": [],
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        cust_key, cust_code, cust_label = customer_identity(inq)
        for p in it.processes:
            key = normalize_tag_key(p.process_tag)
            g = tag_groups[key]
            g["labels"][p.process_tag] += 1
            g["specials"][p.is_special] += 1
            g["item_ids"].add(it.id)
            g["customers"].add(cust_key)
            g["categories"].add(category)
            g["quantity_total"] += int(it.quantity or 0)
            if inq:
                g["quotes"].append(float(inq.final_quote) if inq.final_quote is not None else None)
                g["factory_prices"].append(float(inq.factory_price) if inq.factory_price is not None else None)
                g["gp_rates"].append(float(inq.gross_profit_rate) if inq.gross_profit_rate is not None else None)
                if inq.inquiry_date:
                    g["dates"].append(inq.inquiry_date)

    process_rankings: list[ProcessRanking] = []
    for _key, g in tag_groups.items():
        app_count = len(g["item_ids"])
        if min_usage_count and app_count < min_usage_count:
            continue
        process_rankings.append(ProcessRanking(
            process_tag=mode_value(g["labels"]),
            is_special=bool(mode_value(g["specials"])),
            application_count=app_count,
            style_count=app_count,
            customer_count=len(g["customers"]),
            category_count=len(g["categories"]),
            quantity_total=g["quantity_total"],
            average_final_quote=avg_or_none(g["quotes"]),
            average_factory_price=avg_or_none(g["factory_prices"]),
            average_gross_profit_rate=avg_or_none(g["gp_rates"]),
            latest_inquiry_date=max(g["dates"]) if g["dates"] else None,
        ))
    process_rankings.sort(key=lambda r: -r.application_count)
    special_process_rankings = [r for r in process_rankings if r.is_special]

    # ── 按品类 ──────────────────────────────────────────────────────────────
    category_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "items": [], "tag_counter": Counter(),
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        g = category_groups[category]
        g["items"].append(it)
        for p in it.processes:
            g["tag_counter"][p.process_tag] += 1

    by_category: list[ProcessByCategory] = []
    for category, g in category_groups.items():
        its = g["items"]
        n = len(its)
        with_tags_n = sum(1 for it in its if has_tags(it))
        special_style_n = sum(1 for it in its if any(p.is_special for p in it.processes))
        by_category.append(ProcessByCategory(
            product_category=category,
            style_count=n,
            items_with_process_tags=with_tags_n,
            process_coverage_rate=round(with_tags_n / n, 4) if n else 0.0,
            special_process_style_count=special_style_n,
            special_process_share=round(special_style_n / n, 4) if n else 0.0,
            top_processes=[
                TopProcessBrief(process_tag=tag, application_count=cnt)
                for tag, cnt in g["tag_counter"].most_common(5)
            ],
        ))
    by_category.sort(key=lambda e: -e.style_count)

    # ── 按客户 ──────────────────────────────────────────────────────────────
    customer_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None, "items": [], "tag_counter": Counter(),
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        cust_key, cust_code, cust_label = customer_identity(inq)
        g = customer_groups[cust_key]
        g["cust_code"] = g["cust_code"] or cust_code
        g["cust_label"] = g["cust_label"] or cust_label
        g["items"].append(it)
        for p in it.processes:
            g["tag_counter"][p.process_tag] += 1

    by_customer: list[ProcessByCustomer] = []
    for _cust_key, g in customer_groups.items():
        its = g["items"]
        n = len(its)
        with_tags_n = sum(1 for it in its if has_tags(it))
        special_style_n = sum(1 for it in its if any(p.is_special for p in it.processes))
        by_customer.append(ProcessByCustomer(
            customer_code=g["cust_code"],
            customer_short_name=g["cust_label"],
            style_count=n,
            process_coverage_rate=round(with_tags_n / n, 4) if n else 0.0,
            special_process_style_count=special_style_n,
            special_process_share=round(special_style_n / n, 4) if n else 0.0,
            top_processes=[
                TopProcessBrief(process_tag=tag, application_count=cnt)
                for tag, cnt in g["tag_counter"].most_common(5)
            ],
        ))
    by_customer.sort(key=lambda e: -e.style_count)

    # ── 工艺风险信号（仅做数据关联提示，不做因果判断）──────────────────────────
    special_no_desc = [it for it in items if any(p.is_special for p in it.processes) and not has_description(it)]
    desc_no_tags = [it for it in items if has_description(it) and not has_tags(it)]

    special_item_inq_ids = {
        it.inquiry_id for it in items if any(p.is_special for p in it.processes)
    }
    overdue_sample_inq_ids = await fetch_overdue_sample_inquiry_ids(db, special_item_inq_ids)
    delayed_production_inq_ids = await fetch_delayed_production_inquiry_ids(db, special_item_inq_ids)

    special_sample_delay = [
        it for it in items
        if any(p.is_special for p in it.processes) and it.inquiry_id in overdue_sample_inq_ids
    ]
    special_production_delay = [
        it for it in items
        if any(p.is_special for p in it.processes) and it.inquiry_id in delayed_production_inq_ids
    ]

    process_risk_signals = [
        ProcessRiskSignal(
            signal_type="special_no_description", label="特殊工艺缺少原始说明",
            style_count=len(special_no_desc),
            hint="特殊工艺缺少原始说明，建议补充具体工艺要求",
        ),
        ProcessRiskSignal(
            signal_type="description_no_tags", label="已有工艺描述但未标准化",
            style_count=len(desc_no_tags),
            hint="已有工艺描述，但尚未完成工艺标签标准化",
        ),
        ProcessRiskSignal(
            signal_type="special_sample_delay", label="特殊工艺款式所在询单存在打样逾期记录",
            style_count=len(special_sample_delay),
            hint="特殊工艺款式所在询单存在打样逾期记录（按询单关联，非该款式独有打样记录，仅供参考）",
        ),
        ProcessRiskSignal(
            signal_type="special_production_delay", label="特殊工艺款式所在询单存在生产延期风险或延期记录",
            style_count=len(special_production_delay),
            hint="特殊工艺款式所在询单存在生产延期风险或延期记录（按询单关联，非该款式独有生产记录，仅供参考）",
        ),
    ]

    # ── 优先补录清单 ─────────────────────────────────────────────────────────
    candidates = []
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        missing = missing_process_fields(it)
        if not ((not has_description(it)) or (has_description(it) and not has_tags(it))):
            continue
        candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "responsible_sales": inq.responsible_sales if inq else None,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "product_category": it.product_category,
            "process_description": it.process_description,
            "process_tags": [p.process_tag for p in it.processes],
            "missing_fields": missing,
            "risk_hint": pa_risk_hint(it),
            "inquiry_date": inq.inquiry_date if inq else None,
            "order_status": inq.order_status if inq else None,
            "quote_status": inq.quote_status if inq else None,
            "missing_field_count": len(missing),
            "_tier": priority_tier(it, inq),
            "_updated_at": it.updated_at,
        })
    candidates.sort(key=pa_priority_sort_key, reverse=True)

    priority_items = [
        ProcessPriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            product_name=c["product_name"], style_no=c["style_no"], product_category=c["product_category"],
            process_description=c["process_description"], process_tags=c["process_tags"],
            missing_fields=c["missing_fields"], risk_hint=c["risk_hint"],
            inquiry_date=c["inquiry_date"], order_status=c["order_status"], quote_status=c["quote_status"],
        )
        for c in candidates
    ]

    return ProcessAnalysisResponse(
        summary=summary,
        process_rankings=process_rankings,
        special_process_rankings=special_process_rankings,
        by_category=by_category,
        by_customer=by_customer,
        process_risk_signals=process_risk_signals,
        priority_items=priority_items,
    )


# ── 尺码范围与尺码偏好分析（Step 7）─────────────────────────────────────────────

@router.get("/sizes", response_model=SizeAnalysisResponse)
async def size_analysis(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按有效品类筛选（item 级为空退化用询单级）"),
    series_name: str | None = Query(None, description="按款式系列筛选（item 级字段，精确匹配）"),
    size_code: str | None = Query(None, description="按尺码筛选（大小写不敏感），命中即保留该款式的全部统计"),
    is_special_size: bool | None = Query(None, description="按是否特殊尺码筛选（命中即保留该款式的全部统计）"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
    min_usage_count: int | None = Query(None, ge=1, description="过滤掉应用次数低于该阈值的尺码（仅影响排名展示，不影响总览）"),
):
    """
    尺码范围与尺码偏好分析。款式相关统计单位是 inquiry_items，标准化尺码
    统计单位是 inquiry_item_sizes。权限范围复用 apply_inquiry_scope。口径
    详见 size_analysis_service 模块顶部说明（尺码缺失三态 / 特殊尺码口径 /
    尺码跨度分组 / 风险信号的询单级近似限制）。
    """
    q = (
        select(InquiryItem)
        .join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
        .options(selectinload(InquiryItem.sizes))
    )
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if series_name:
        q = q.where(InquiryItem.series_name == series_name)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)

    raw_items = list((await db.execute(q)).scalars().unique().all())

    inq_ids = {it.inquiry_id for it in raw_items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    # ── 有效品类 / 尺码 / 是否特殊 过滤（有退化规则，不能直接下推到 SQL）────────
    def _matches_size_filter(it: InquiryItem) -> bool:
        if size_code is None and is_special_size is None:
            return True
        target_key = normalize_size_key(size_code) if size_code else None
        for s in it.sizes:
            if target_key is not None and normalize_size_key(s.size_code) != target_key:
                continue
            if is_special_size is not None and s.is_special_size != is_special_size:
                continue
            return True
        return False

    items: list[InquiryItem] = []
    for it in raw_items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        if product_category and category != product_category:
            continue
        if not _matches_size_filter(it):
            continue
        items.append(it)

    total_items = len(items)

    # ── 总览：缺原始范围 / 有范围缺标准化 / 有标准化 三态互斥统计 ───────────────
    with_range = sum(1 for it in items if has_size_range(it))
    with_std = sum(1 for it in items if has_standard_sizes(it))
    range_no_std = sum(1 for it in items if has_size_range(it) and not has_standard_sizes(it))
    total_applications = sum(len(it.sizes) for it in items)
    special_applications = sum(1 for it in items for s in it.sizes if s.is_special_size)
    wide_span_count = sum(1 for it in items if size_span_count(it) >= 6)

    summary = SizeAnalysisSummary(
        total_style_items=total_items,
        items_with_size_range=with_range,
        items_with_standard_sizes=with_std,
        items_without_size_data=sum(1 for it in items if not has_size_range(it) and not has_standard_sizes(it)),
        items_with_size_range_but_no_standard_sizes=range_no_std,
        total_size_applications=total_applications,
        unique_size_codes=len({normalize_size_key(s.size_code) for it in items for s in it.sizes}),
        special_size_applications=special_applications,
        special_size_share=round(special_applications / total_applications, 4) if total_applications else 0.0,
        wide_span_style_count=wide_span_count,
    )

    # ── 尺码分组（按 size_code 归并 key，跨款式聚合）────────────────────────────
    size_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "labels": Counter(), "specials": Counter(), "item_ids": set(),
        "customers": set(), "categories": set(), "quantity_total": 0, "dates": [],
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        cust_key, cust_code, cust_label = customer_identity(inq)
        for s in it.sizes:
            key = normalize_size_key(s.size_code)
            g = size_groups[key]
            g["labels"][s.size_code] += 1
            g["specials"][s.is_special_size] += 1
            g["item_ids"].add(it.id)
            g["customers"].add(cust_key)
            g["categories"].add(category)
            g["quantity_total"] += int(it.quantity or 0)
            if inq and inq.inquiry_date:
                g["dates"].append(inq.inquiry_date)

    size_rankings: list[SizeRanking] = []
    for _key, g in size_groups.items():
        app_count = len(g["item_ids"])
        if min_usage_count and app_count < min_usage_count:
            continue
        size_rankings.append(SizeRanking(
            size_code=sa_mode_value(g["labels"]),
            is_special_size=bool(sa_mode_value(g["specials"])),
            application_count=app_count,
            style_count=app_count,
            customer_count=len(g["customers"]),
            category_count=len(g["categories"]),
            quantity_total=g["quantity_total"],
            latest_inquiry_date=max(g["dates"]) if g["dates"] else None,
        ))
    size_rankings.sort(key=lambda r: -r.application_count)
    special_size_rankings = [r for r in size_rankings if r.is_special_size]

    # ── 按品类 ──────────────────────────────────────────────────────────────
    category_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "items": [], "size_counter": Counter(),
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        g = category_groups[category]
        g["items"].append(it)
        for s in it.sizes:
            g["size_counter"][s.size_code] += 1

    by_category: list[SizeByCategory] = []
    for category, g in category_groups.items():
        its = g["items"]
        n = len(its)
        with_std_n = sum(1 for it in its if has_standard_sizes(it))
        special_style_n = sum(1 for it in its if any(s.is_special_size for s in it.sizes))
        by_category.append(SizeByCategory(
            product_category=category,
            style_count=n,
            size_coverage_rate=round(with_std_n / n, 4) if n else 0.0,
            special_size_style_count=special_style_n,
            special_size_share=round(special_style_n / n, 4) if n else 0.0,
            average_size_span_count=sa_avg_or_none([float(size_span_count(it)) for it in its]),
            top_sizes=[
                TopSizeBrief(size_code=code, application_count=cnt)
                for code, cnt in g["size_counter"].most_common(5)
            ],
        ))
    by_category.sort(key=lambda e: -e.style_count)

    # ── 按客户 ──────────────────────────────────────────────────────────────
    customer_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None, "items": [], "size_counter": Counter(),
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        cust_key, cust_code, cust_label = customer_identity(inq)
        g = customer_groups[cust_key]
        g["cust_code"] = g["cust_code"] or cust_code
        g["cust_label"] = g["cust_label"] or cust_label
        g["items"].append(it)
        for s in it.sizes:
            g["size_counter"][s.size_code] += 1

    by_customer: list[SizeByCustomer] = []
    for _cust_key, g in customer_groups.items():
        its = g["items"]
        n = len(its)
        with_std_n = sum(1 for it in its if has_standard_sizes(it))
        special_style_n = sum(1 for it in its if any(s.is_special_size for s in it.sizes))
        by_customer.append(SizeByCustomer(
            customer_code=g["cust_code"],
            customer_short_name=g["cust_label"],
            style_count=n,
            size_coverage_rate=round(with_std_n / n, 4) if n else 0.0,
            special_size_style_count=special_style_n,
            special_size_share=round(special_style_n / n, 4) if n else 0.0,
            average_size_span_count=sa_avg_or_none([float(size_span_count(it)) for it in its]),
            top_sizes=[
                TopSizeBrief(size_code=code, application_count=cnt)
                for code, cnt in g["size_counter"].most_common(5)
            ],
        ))
    by_customer.sort(key=lambda e: -e.style_count)

    # ── 尺码跨度分布 ─────────────────────────────────────────────────────────
    bucket_counts: Counter = Counter(span_bucket(size_span_count(it)) for it in items)
    size_span_distribution = [
        SizeSpanBucket(
            span_bucket=b, style_count=bucket_counts.get(b, 0),
            share=round(bucket_counts.get(b, 0) / total_items, 4) if total_items else 0.0,
        )
        for b in SPAN_BUCKETS
    ]

    # ── 尺码风险信号（仅做数据关联提示，不做因果判断）──────────────────────────
    special_no_range = [it for it in items if any(s.is_special_size for s in it.sizes) and not has_size_range(it)]
    range_no_std_items = [it for it in items if has_size_range(it) and not has_standard_sizes(it)]

    special_item_inq_ids = {
        it.inquiry_id for it in items if any(s.is_special_size for s in it.sizes)
    }
    overdue_sample_inq_ids = await sa_fetch_overdue_sample_inquiry_ids(db, special_item_inq_ids)
    delayed_production_inq_ids = await sa_fetch_delayed_production_inquiry_ids(db, special_item_inq_ids)

    special_sample_delay = [
        it for it in items
        if any(s.is_special_size for s in it.sizes) and it.inquiry_id in overdue_sample_inq_ids
    ]
    special_production_delay = [
        it for it in items
        if any(s.is_special_size for s in it.sizes) and it.inquiry_id in delayed_production_inq_ids
    ]

    size_risk_signals = [
        SizeRiskSignal(
            signal_type="special_no_range", label="特殊尺码缺少原始尺码范围",
            style_count=len(special_no_range),
            hint="包含特殊尺码，但缺少原始尺码范围说明",
        ),
        SizeRiskSignal(
            signal_type="range_no_standard", label="已有尺码范围但未标准化",
            style_count=len(range_no_std_items),
            hint="已有尺码范围，但尚未完成尺码标准化",
        ),
        SizeRiskSignal(
            signal_type="special_sample_delay", label="特殊尺码款式所在询单存在打样延期记录",
            style_count=len(special_sample_delay),
            hint="包含特殊尺码的款式所在询单存在打样延期记录（按询单关联，非该款式独有打样记录，仅供参考）",
        ),
        SizeRiskSignal(
            signal_type="special_production_delay", label="特殊尺码款式所在询单存在生产延期风险或延期记录",
            style_count=len(special_production_delay),
            hint="包含特殊尺码的款式所在询单存在生产延期风险或延期记录（按询单关联，非该款式独有生产记录，仅供参考）",
        ),
    ]

    # ── 优先补录清单 ─────────────────────────────────────────────────────────
    candidates = []
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        missing = missing_size_fields(it)
        if not sz_is_priority_candidate(it):
            continue
        candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "responsible_sales": inq.responsible_sales if inq else None,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "product_category": it.product_category,
            "size_range": it.size_range,
            "size_codes": [s.size_code for s in it.sizes],
            "missing_fields": missing,
            "risk_hint": sz_risk_hint(it),
            "inquiry_date": inq.inquiry_date if inq else None,
            "order_status": inq.order_status if inq else None,
            "quote_status": inq.quote_status if inq else None,
            "missing_field_count": len(missing),
            "_tier": sz_priority_tier(it, inq),
            "_updated_at": it.updated_at,
        })
    candidates.sort(key=sz_priority_sort_key, reverse=True)

    priority_items = [
        SizePriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            product_name=c["product_name"], style_no=c["style_no"], product_category=c["product_category"],
            size_range=c["size_range"], size_codes=c["size_codes"],
            missing_fields=c["missing_fields"], risk_hint=c["risk_hint"],
            inquiry_date=c["inquiry_date"], order_status=c["order_status"], quote_status=c["quote_status"],
        )
        for c in candidates
    ]

    return SizeAnalysisResponse(
        summary=summary,
        size_rankings=size_rankings,
        special_size_rankings=special_size_rankings,
        by_category=by_category,
        by_customer=by_customer,
        size_span_distribution=size_span_distribution,
        size_risk_signals=size_risk_signals,
        priority_items=priority_items,
    )


# ── 报价数量 / 订单规模分析（Step 8）───────────────────────────────────────────

@router.get("/quote-quantity", response_model=QuantityAnalysisResponse)
async def quantity_analysis(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按有效品类筛选（item 级为空退化用询单级）"),
    series_name: str | None = Query(None, description="按款式系列筛选（item 级字段，精确匹配）"),
    order_status: str | None = Query(None),
    quote_status: str | None = Query(None),
    quantity_bucket_filter: str | None = Query(None, alias="quantity_bucket", description="按数量区间筛选"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
    min_quantity: int | None = Query(None, ge=0),
    max_quantity: int | None = Query(None, ge=0),
):
    """
    报价数量 / 订单规模分析。统计单位是 inquiry_items（款式明细），数量字段
    统一使用 inquiry_items.quantity。权限范围复用 apply_inquiry_scope。
    口径详见 quantity_analysis_service 模块顶部说明（NULL/0 区分、分桶规则、
    P95 风险提示的最小样本量限制）。
    """
    q = select(InquiryItem).join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if series_name:
        q = q.where(InquiryItem.series_name == series_name)
    if order_status:
        q = q.where(Inquiry.order_status == order_status)
    if quote_status:
        q = q.where(Inquiry.quote_status == quote_status)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)
    if min_quantity is not None:
        q = q.where(InquiryItem.quantity >= min_quantity)
    if max_quantity is not None:
        q = q.where(InquiryItem.quantity <= max_quantity)

    raw_items = list((await db.execute(q)).scalars().unique().all())

    inq_ids = {it.inquiry_id for it in raw_items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    # ── 有效品类 / 数量区间 过滤（有退化规则或派生计算，不能直接下推到 SQL）────
    items: list[InquiryItem] = []
    for it in raw_items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        if product_category and category != product_category:
            continue
        if quantity_bucket_filter and quantity_bucket(it.quantity) != quantity_bucket_filter:
            continue
        items.append(it)

    total_items = len(items)
    non_null_quantities = [float(it.quantity) for it in items if it.quantity is not None]

    # ── 总览 ────────────────────────────────────────────────────────────────
    with_qty = len(non_null_quantities)
    buckets_per_item = {it.id: quantity_bucket(it.quantity) for it in items}
    summary = QuantityAnalysisSummary(
        total_style_items=total_items,
        items_with_quantity=with_qty,
        items_without_quantity=total_items - with_qty,
        quantity_total=int(sum(non_null_quantities)),
        average_quantity=qa_avg_or_none(non_null_quantities),
        median_quantity=median_or_none(non_null_quantities),
        min_quantity=int(min(non_null_quantities)) if non_null_quantities else None,
        max_quantity=int(max(non_null_quantities)) if non_null_quantities else None,
        small_batch_style_count=sum(1 for it in items if is_small_batch(buckets_per_item[it.id])),
        large_batch_style_count=sum(1 for it in items if is_large_batch(buckets_per_item[it.id])),
    )

    # ── 数量分布 ────────────────────────────────────────────────────────────
    bucket_groups: dict[str, list[InquiryItem]] = {b: [] for b in BUCKET_ORDER}
    for it in items:
        bucket_groups[buckets_per_item[it.id]].append(it)

    quantity_distribution: list[QuantityDistributionBucket] = []
    for b in BUCKET_ORDER:
        its = bucket_groups[b]
        n = len(its)
        customers = {customer_identity(inquiries.get(it.inquiry_id))[0] for it in its}
        categories = {effective_category(it, inquiries.get(it.inquiry_id)) for it in its}
        quantity_distribution.append(QuantityDistributionBucket(
            quantity_bucket=b,
            style_count=n,
            style_share=round(n / total_items, 4) if total_items else 0.0,
            quantity_total=int(sum(it.quantity for it in its if it.quantity is not None)),
            customer_count=len(customers),
            category_count=len(categories),
        ))

    # ── 按客户 ──────────────────────────────────────────────────────────────
    customer_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "cust_code": None, "cust_label": None, "items": [],
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        cust_key, cust_code, cust_label = customer_identity(inq)
        g = customer_groups[cust_key]
        g["cust_code"] = g["cust_code"] or cust_code
        g["cust_label"] = g["cust_label"] or cust_label
        g["items"].append(it)

    by_customer: list[QuantityByCustomer] = []
    for _cust_key, g in customer_groups.items():
        its = g["items"]
        n = len(its)
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        bucket_counter = Counter(buckets_per_item[it.id] for it in its)
        by_customer.append(QuantityByCustomer(
            customer_code=g["cust_code"], customer_short_name=g["cust_label"],
            style_count=n, items_with_quantity=len(qtys),
            quantity_coverage_rate=round(len(qtys) / n, 4) if n else 0.0,
            quantity_total=int(sum(qtys)),
            average_quantity=qa_avg_or_none(qtys), median_quantity=median_or_none(qtys),
            top_quantity_bucket=qa_mode_value(bucket_counter),
            small_batch_share=round(sum(1 for it in its if is_small_batch(buckets_per_item[it.id])) / n, 4) if n else 0.0,
            large_batch_share=round(sum(1 for it in its if is_large_batch(buckets_per_item[it.id])) / n, 4) if n else 0.0,
        ))
    by_customer.sort(key=lambda e: -e.style_count)

    # ── 按品类 ──────────────────────────────────────────────────────────────
    category_groups: dict[str, list[InquiryItem]] = defaultdict(list)
    for it in items:
        category_groups[effective_category(it, inquiries.get(it.inquiry_id))].append(it)

    by_category: list[QuantityByCategory] = []
    for category, its in category_groups.items():
        n = len(its)
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        bucket_counter = Counter(buckets_per_item[it.id] for it in its)
        by_category.append(QuantityByCategory(
            product_category=category, style_count=n,
            quantity_coverage_rate=round(len(qtys) / n, 4) if n else 0.0,
            quantity_total=int(sum(qtys)),
            average_quantity=qa_avg_or_none(qtys), median_quantity=median_or_none(qtys),
            top_quantity_bucket=qa_mode_value(bucket_counter),
            small_batch_share=round(sum(1 for it in its if is_small_batch(buckets_per_item[it.id])) / n, 4) if n else 0.0,
            large_batch_share=round(sum(1 for it in its if is_large_batch(buckets_per_item[it.id])) / n, 4) if n else 0.0,
        ))
    by_category.sort(key=lambda e: -e.style_count)

    # ── 按业务员（responsible_sales，不是 quote_prepared_by）────────────────────
    sales_groups: dict[str, list[InquiryItem]] = defaultdict(list)
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        key = (inq.responsible_sales if inq else None) or "未知"
        sales_groups[key].append(it)

    by_sales: list[QuantityBySales] = []
    for name, its in sales_groups.items():
        n = len(its)
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        bucket_counter = Counter(buckets_per_item[it.id] for it in its)
        by_sales.append(QuantityBySales(
            responsible_sales=name, style_count=n,
            quantity_coverage_rate=round(len(qtys) / n, 4) if n else 0.0,
            quantity_total=int(sum(qtys)),
            average_quantity=qa_avg_or_none(qtys), median_quantity=median_or_none(qtys),
            top_quantity_bucket=qa_mode_value(bucket_counter),
        ))
    by_sales.sort(key=lambda e: -e.style_count)

    # ── 按报价/订单状态 ─────────────────────────────────────────────────────
    status_groups: dict[tuple[str, str], list[InquiryItem]] = defaultdict(list)
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        key = ((inq.quote_status if inq else None) or "未知", (inq.order_status if inq else None) or "未知")
        status_groups[key].append(it)

    by_order_status: list[QuantityByOrderStatus] = []
    for (qs, os_), its in status_groups.items():
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        by_order_status.append(QuantityByOrderStatus(
            quote_status=qs, order_status=os_, style_count=len(its),
            quantity_total=int(sum(qtys)),
            average_quantity=qa_avg_or_none(qtys), median_quantity=median_or_none(qtys),
        ))
    by_order_status.sort(key=lambda e: -e.style_count)

    # ── 数量风险提示（仅做数据关联提示，不做因果判断）──────────────────────────
    priority_no_qty = [
        it for it in items if it.quantity is None and qa_has_priority_status(inquiries.get(it.inquiry_id))
    ]
    zero_qty = [it for it in items if it.quantity == 0]

    p95 = percentile_or_none(non_null_quantities, 95) if len(non_null_quantities) >= P95_MIN_SAMPLE else None
    high_qty = [it for it in items if p95 is not None and it.quantity is not None and it.quantity > p95]
    low_positive_qty = [it for it in items if it.quantity is not None and 0 < it.quantity < 100]

    quantity_risk_signals = [
        QuantityRiskSignal(
            signal_type="priority_no_quantity", label="已报价/已下单但缺数量",
            style_count=len(priority_no_qty),
            hint="已报价或已下单款式缺少数量资料，建议补录",
        ),
        QuantityRiskSignal(
            signal_type="zero_quantity", label="数量为 0",
            style_count=len(zero_qty),
            hint="款式数量为 0，请确认是否为试样、占位数据或录入错误",
        ),
        QuantityRiskSignal(
            signal_type="high_quantity_p95",
            label="数量高于当前筛选范围 P95" if p95 is not None else "数量高于 P95（样本不足 20 条，暂不计算）",
            style_count=len(high_qty),
            hint=(
                f"数量高于当前筛选范围的 P95（{p95:.0f}），建议确认是否录入正确"
                if p95 is not None else "当前筛选范围非空数量样本数不足 20 条，暂不计算 P95"
            ),
        ),
        QuantityRiskSignal(
            signal_type="low_positive_quantity", label="小批量款式（0 < 数量 < 100）",
            style_count=len(low_positive_qty),
            hint="小批量款式，建议结合 MOQ 或打样需求确认",
        ),
    ]

    # ── 优先补录清单 ─────────────────────────────────────────────────────────
    candidates = []
    for it in items:
        if not qa_is_priority_candidate(it):
            continue
        inq = inquiries.get(it.inquiry_id)
        candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "responsible_sales": inq.responsible_sales if inq else None,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "product_category": it.product_category,
            "quantity": it.quantity,
            "quantity_bucket": buckets_per_item[it.id],
            "risk_hint": qa_risk_hint(it, inq),
            "inquiry_date": inq.inquiry_date if inq else None,
            "order_status": inq.order_status if inq else None,
            "quote_status": inq.quote_status if inq else None,
            "_tier": qa_priority_tier(it, inq),
            "_updated_at": it.updated_at,
        })
    candidates.sort(key=qa_priority_sort_key, reverse=True)

    priority_items = [
        QuantityPriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            product_name=c["product_name"], style_no=c["style_no"], product_category=c["product_category"],
            quantity=c["quantity"], quantity_bucket=c["quantity_bucket"], risk_hint=c["risk_hint"],
            inquiry_date=c["inquiry_date"], order_status=c["order_status"], quote_status=c["quote_status"],
        )
        for c in candidates
    ]

    return QuantityAnalysisResponse(
        summary=summary,
        quantity_distribution=quantity_distribution,
        by_customer=by_customer,
        by_category=by_category,
        by_sales=by_sales,
        by_order_status=by_order_status,
        quantity_risk_signals=quantity_risk_signals,
        priority_items=priority_items,
    )


# ── 报价单填报人 / 人员维度分析（Step 9）─────────────────────────────────────────

@router.get("/quote-preparers", response_model=PreparerAnalysisResponse)
async def quote_preparer_analysis(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    quote_prepared_by: str | None = Query(None, description="按填报人筛选（大小写/首尾空格不敏感）"),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None, description="按有效品类筛选（item 级为空退化用询单级）"),
    series_name: str | None = Query(None, description="按款式系列筛选（item 级字段，精确匹配）"),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
    min_item_count: int | None = Query(None, ge=1, description="过滤掉款式数低于该阈值的填报人（仅影响排名展示，不影响总览）"),
):
    """
    报价单填报人 / 人员维度分析。统计单位是 inquiry_items（款式明细）。
    权限范围复用 apply_inquiry_scope。口径详见 quote_preparer_analysis_service
    模块顶部说明——quote_prepared_by（实际填报人）与 responsible_sales
    （负责业务员）是两个独立字段，本接口不会用后者推断或填充前者。
    """
    q = (
        select(InquiryItem)
        .join(Inquiry, InquiryItem.inquiry_id == Inquiry.id)
        .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
    )
    q = apply_inquiry_scope(q, user)

    if year:
        q = q.where(Inquiry.inquiry_year == year)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if series_name:
        q = q.where(InquiryItem.series_name == series_name)
    if start_date:
        q = q.where(Inquiry.inquiry_date >= start_date)
    if end_date:
        q = q.where(Inquiry.inquiry_date <= end_date)

    raw_items = list((await db.execute(q)).scalars().unique().all())

    inq_ids = {it.inquiry_id for it in raw_items}
    inquiries: dict[Any, Inquiry] = {}
    if inq_ids:
        inq_rows = (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()
        inquiries = {inq.id: inq for inq in inq_rows}

    # ── 有效品类 / 填报人 过滤（有退化规则或归并 key，不能直接下推到 SQL）──────
    target_preparer_key = normalize_preparer(quote_prepared_by) if quote_prepared_by else None
    items: list[InquiryItem] = []
    for it in raw_items:
        inq = inquiries.get(it.inquiry_id)
        category = effective_category(it, inq)
        if product_category and category != product_category:
            continue
        if target_preparer_key is not None and normalize_preparer(it.quote_prepared_by) != target_preparer_key:
            continue
        items.append(it)

    total_items = len(items)
    with_preparer = sum(1 for it in items if has_preparer(it))

    # ── 填报人分组（含"未填写填报人"，不静默排除）───────────────────────────────
    preparer_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "labels": Counter(), "items": [],
    })
    for it in items:
        key = normalize_preparer(it.quote_prepared_by)
        g = preparer_groups[key]
        g["labels"][preparer_label(it.quote_prepared_by)] += 1
        g["items"].append(it)

    unique_preparer_count = sum(1 for key in preparer_groups if key != "unfilled")
    differs_count = sum(1 for it in items if differs_from_responsible_sales(it, inquiries.get(it.inquiry_id)))

    # ── 填报人排名（min_item_count 仅影响这里的展示，不影响总览口径）───────────
    preparer_rankings: list[PreparerRanking] = []
    for key, g in preparer_groups.items():
        its = g["items"]
        n = len(its)
        if min_item_count and n < min_item_count:
            continue
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        inq_set = {it.inquiry_id for it in its}
        customers = {customer_identity(inquiries.get(it.inquiry_id))[0] for it in its}
        categories = {effective_category(it, inquiries.get(it.inquiry_id)) for it in its}
        resp_sales_set = {(inquiries.get(it.inquiry_id).responsible_sales if inquiries.get(it.inquiry_id) else None) or "未知" for it in its}
        dates = [inquiries.get(it.inquiry_id).inquiry_date for it in its if inquiries.get(it.inquiry_id) and inquiries.get(it.inquiry_id).inquiry_date]
        complete_n = sum(1 for it in its if classify_item(it) == "complete")
        preparer_rankings.append(PreparerRanking(
            quote_prepared_by=qp_mode_value(g["labels"]),
            style_count=n,
            inquiry_count=len(inq_set),
            customer_count=len(customers),
            category_count=len(categories),
            quantity_total=int(sum(qtys)),
            average_quantity=round(sum(qtys) / len(qtys), 4) if qtys else None,
            median_quantity=median_or_none(qtys),
            items_with_process_tags=sum(1 for it in its if has_tags(it)),
            items_with_standard_sizes=sum(1 for it in its if has_standard_sizes(it)),
            data_completeness_rate=round(complete_n / n, 4) if n else 0.0,
            responsible_sales_count=len(resp_sales_set),
            latest_inquiry_date=max(dates) if dates else None,
        ))
    preparer_rankings.sort(key=lambda r: -r.style_count)

    # ── 总览（基于未经 min_item_count 过滤的完整数据计算）───────────────────────
    top_preparer = None
    real_preparer_entries = [
        (key, g) for key, g in preparer_groups.items() if key != "unfilled"
    ]
    if real_preparer_entries:
        best_key, best_g = max(real_preparer_entries, key=lambda kv: len(kv[1]["items"]))
        top_preparer = TopPreparerBrief(
            quote_prepared_by=qp_mode_value(best_g["labels"]), style_count=len(best_g["items"]),
        )

    summary = PreparerAnalysisSummary(
        total_style_items=total_items,
        items_with_preparer=with_preparer,
        items_without_preparer=total_items - with_preparer,
        preparer_coverage_rate=round(with_preparer / total_items, 4) if total_items else 0.0,
        unique_preparer_count=unique_preparer_count,
        top_preparer=top_preparer,
        items_where_preparer_differs_from_responsible_sales=differs_count,
    )

    # ── 按客户 ──────────────────────────────────────────────────────────────
    pc_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "preparer_label": None, "cust_code": None, "cust_label": None,
        "items": [], "categories": set(), "dates": [],
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        p_key = normalize_preparer(it.quote_prepared_by)
        cust_key, cust_code, cust_label = customer_identity(inq)
        g = pc_groups[(p_key, cust_key)]
        g["preparer_label"] = g["preparer_label"] or preparer_label(it.quote_prepared_by)
        g["cust_code"] = g["cust_code"] or cust_code
        g["cust_label"] = g["cust_label"] or cust_label
        g["items"].append(it)
        g["categories"].add(effective_category(it, inq))
        if inq and inq.inquiry_date:
            g["dates"].append(inq.inquiry_date)

    by_customer = [
        PreparerByCustomer(
            quote_prepared_by=g["preparer_label"], customer_code=g["cust_code"], customer_short_name=g["cust_label"],
            style_count=len(g["items"]), category_count=len(g["categories"]),
            quantity_total=int(sum(it.quantity for it in g["items"] if it.quantity is not None)),
            latest_inquiry_date=max(g["dates"]) if g["dates"] else None,
        )
        for g in pc_groups.values()
    ]
    by_customer.sort(key=lambda e: -e.style_count)

    # ── 按品类 ──────────────────────────────────────────────────────────────
    pcat_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "preparer_label": None, "items": [],
    })
    preparer_totals: dict[str, int] = {key: len(g["items"]) for key, g in preparer_groups.items()}
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        p_key = normalize_preparer(it.quote_prepared_by)
        category = effective_category(it, inq)
        g = pcat_groups[(p_key, category)]
        g["preparer_label"] = g["preparer_label"] or preparer_label(it.quote_prepared_by)
        g["items"].append(it)

    by_category = []
    for (p_key, category), g in pcat_groups.items():
        its = g["items"]
        qtys = [float(it.quantity) for it in its if it.quantity is not None]
        total_for_preparer = preparer_totals.get(p_key, 0)
        by_category.append(PreparerByCategory(
            quote_prepared_by=g["preparer_label"], product_category=category,
            style_count=len(its),
            style_share_in_preparer=round(len(its) / total_for_preparer, 4) if total_for_preparer else 0.0,
            quantity_total=int(sum(qtys)),
            average_quantity=round(sum(qtys) / len(qtys), 4) if qtys else None,
        ))
    by_category.sort(key=lambda e: -e.style_count)

    # ── 按数量区间（复用 Step 8 的统一分桶规则）─────────────────────────────────
    pbucket_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "preparer_label": None, "items": [],
    })
    for it in items:
        p_key = normalize_preparer(it.quote_prepared_by)
        bucket = quantity_bucket(it.quantity)
        g = pbucket_groups[(p_key, bucket)]
        g["preparer_label"] = g["preparer_label"] or preparer_label(it.quote_prepared_by)
        g["items"].append(it)

    by_quantity_bucket = []
    for (p_key, bucket), g in pbucket_groups.items():
        total_for_preparer = preparer_totals.get(p_key, 0)
        by_quantity_bucket.append(PreparerByQuantityBucket(
            quote_prepared_by=g["preparer_label"], quantity_bucket=bucket,
            style_count=len(g["items"]),
            style_share=round(len(g["items"]) / total_for_preparer, 4) if total_for_preparer else 0.0,
        ))
    by_quantity_bucket.sort(key=lambda e: (-e.style_count))

    # ── 按负责业务员（协作分布，不做问题判定）───────────────────────────────────
    prs_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {
        "resp_label": None, "preparer_label": None, "items": [], "inq_ids": set(), "same_person": False,
    })
    for it in items:
        inq = inquiries.get(it.inquiry_id)
        resp_raw = inq.responsible_sales if inq else None
        resp_filled = bool(resp_raw is not None and resp_raw.strip())
        resp_label = resp_raw.strip() if resp_filled else "未知"
        p_key = normalize_preparer(it.quote_prepared_by)
        key = (resp_label, p_key)
        g = prs_groups[key]
        g["resp_label"] = resp_label
        g["preparer_label"] = preparer_label(it.quote_prepared_by)
        g["items"].append(it)
        g["inq_ids"].add(it.inquiry_id)
        g["same_person"] = has_preparer(it) and resp_filled and normalize_preparer(resp_raw) == p_key

    by_responsible_sales = [
        PreparerByResponsibleSales(
            responsible_sales=g["resp_label"], quote_prepared_by=g["preparer_label"],
            style_count=len(g["items"]), inquiry_count=len(g["inq_ids"]), same_person=g["same_person"],
        )
        for g in prs_groups.values()
    ]
    by_responsible_sales.sort(key=lambda e: -e.style_count)

    # ── 数据质量提示（仅做提示，不自动预警升级，不评价个人）──────────────────────
    priority_no_preparer = [
        it for it in items
        if not has_preparer(it) and (
            (inquiries.get(it.inquiry_id) and inquiries.get(it.inquiry_id).order_status in QP_ORDER_PRIORITY_STATUSES)
            or (inquiries.get(it.inquiry_id) and inquiries.get(it.inquiry_id).quote_status in QP_QUOTE_PRIORITY_STATUSES)
        )
    ]
    low_completeness_preparer_keys = {
        key for key, g in preparer_groups.items()
        if key != "unfilled"
        and len(g["items"]) >= LOW_COMPLETENESS_MIN_STYLE_COUNT
        and (sum(1 for it in g["items"] if classify_item(it) == "complete") / len(g["items"])) < LOW_COMPLETENESS_THRESHOLD
    }
    low_completeness_item_count = sum(
        len(preparer_groups[key]["items"]) for key in low_completeness_preparer_keys
    )

    data_quality_signals = [
        PreparerDataQualitySignal(
            signal_type="priority_no_preparer", label="已报价/已下单但缺填报人",
            style_count=len(priority_no_preparer),
            hint="已报价或已下单款式缺少报价单填报人，建议补录",
        ),
        PreparerDataQualitySignal(
            signal_type="low_completeness_preparer", label="填报人资料完整率较低",
            style_count=low_completeness_item_count,
            hint="该填报人的报价资料完整率较低，建议优先补充款号、工艺、尺码等资料（资料完整度提示，非人员评价）",
        ),
        PreparerDataQualitySignal(
            signal_type="collaboration", label="报价资料由协作人员填写",
            style_count=differs_count,
            hint="填报人与负责业务员不同，报价资料由协作人员填写（仅作分布展示，不代表问题）",
        ),
    ]

    # ── 优先补录清单 ─────────────────────────────────────────────────────────
    candidates = []
    for it in items:
        if not qp_is_priority_candidate(it):
            continue
        inq = inquiries.get(it.inquiry_id)
        candidates.append({
            "inquiry_id": str(it.inquiry_id),
            "inquiry_no": (inq.inquiry_no if inq else it.inquiry_no) or "",
            "item_id": str(it.id),
            "customer_short_name": inq.customer_short_name if inq else None,
            "responsible_sales": inq.responsible_sales if inq else None,
            "quote_prepared_by": it.quote_prepared_by,
            "product_name": it.product_name,
            "style_no": it.style_no,
            "product_category": it.product_category,
            "quantity": it.quantity,
            "inquiry_date": inq.inquiry_date if inq else None,
            "quote_status": inq.quote_status if inq else None,
            "order_status": inq.order_status if inq else None,
            "missing_fields": ["报价单填报人"],
            "risk_hint": qp_risk_hint(it, inq),
            "_tier": qp_priority_tier(it, inq),
            "_updated_at": it.updated_at,
        })
    candidates.sort(key=qp_priority_sort_key, reverse=True)

    priority_items = [
        PreparerPriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            quote_prepared_by=c["quote_prepared_by"], product_name=c["product_name"], style_no=c["style_no"],
            product_category=c["product_category"], quantity=c["quantity"], inquiry_date=c["inquiry_date"],
            quote_status=c["quote_status"], order_status=c["order_status"],
            missing_fields=c["missing_fields"], risk_hint=c["risk_hint"],
        )
        for c in candidates
    ]

    return PreparerAnalysisResponse(
        summary=summary,
        preparer_rankings=preparer_rankings,
        by_customer=by_customer,
        by_category=by_category,
        by_quantity_bucket=by_quantity_bucket,
        by_responsible_sales=by_responsible_sales,
        data_quality_signals=data_quality_signals,
        priority_items=priority_items,
    )


# ── 报价资料分析总览（统一入口）─────────────────────────────────────────────────

@router.get("/quote-analysis-overview", response_model=QuoteAnalysisOverviewResponse)
async def quote_analysis_overview(
    db: DbDep,
    user: UserDep,
    year: int | None = Query(None),
    group_name: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    customer_code: str | None = Query(None),
    product_category: str | None = Query(None),
    start_date: date_type | None = Query(None, description="询单日期起始（含）"),
    end_date: date_type | None = Query(None, description="询单日期截止（含）"),
):
    """
    报价资料分析总览。本接口不重新查询或重新统计——所有数字直接来自调用
    Step 4-9 六个分析接口本体函数后的返回结果，确保总览与细分页面口径
    完全一致。只新增"字段覆盖率→优先级"映射和"六份 priority_items 如何
    去重合并排序"这两块总览页自己的逻辑，详见
    quote_analysis_overview_service 模块顶部说明。
    """
    qdq = await quote_data_quality(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        customer_code=customer_code, product_category=product_category,
        import_batch_id=None, start_date=start_date, end_date=end_date,
    )
    ccs = await customer_category_styles(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        customer_code=customer_code, product_category=product_category, series_name=None,
        start_date=start_date, end_date=end_date, min_style_count=None,
    )
    pa = await process_analysis(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        customer_code=customer_code, product_category=product_category, series_name=None,
        process_tag=None, is_special=None, start_date=start_date, end_date=end_date, min_usage_count=None,
    )
    sa = await size_analysis(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        customer_code=customer_code, product_category=product_category, series_name=None,
        size_code=None, is_special_size=None, start_date=start_date, end_date=end_date, min_usage_count=None,
    )
    qa = await quantity_analysis(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        customer_code=customer_code, product_category=product_category, series_name=None,
        order_status=None, quote_status=None, quantity_bucket_filter=None,
        start_date=start_date, end_date=end_date, min_quantity=None, max_quantity=None,
    )
    qp = await quote_preparer_analysis(
        db, user, year=year, group_name=group_name, responsible_sales=responsible_sales,
        quote_prepared_by=None, customer_code=customer_code, product_category=product_category,
        series_name=None, start_date=start_date, end_date=end_date, min_item_count=None,
    )

    # ── 总览卡片：直接取自各子分析的 summary，不重新计算 ────────────────────────
    summary = OverviewSummary(
        total_style_items=qdq.summary.total_inquiry_items,
        overall_completeness_rate=qdq.summary.overall_completeness_rate,
        items_needing_completion=qdq.summary.partially_complete_items + qdq.summary.high_missing_items,
        customer_count=ccs.summary.total_customers,
        category_count=ccs.summary.total_categories,
        unique_process_tags=pa.summary.unique_process_tags,
        unique_size_codes=sa.summary.unique_size_codes,
        items_with_quantity=qa.summary.items_with_quantity,
        items_with_quote_preparer=qp.summary.items_with_preparer,
    )

    # ── 关键缺口：直接取自报价资料完整度的字段覆盖率，按覆盖率升序排列 ───────────
    key_gaps = [
        KeyGap(
            field_key=f.field_key, field_label=f.field_label, missing_count=f.missing_count,
            coverage_rate=f.coverage_rate, priority_level=priority_level(f.coverage_rate),
            target_module="/quote-data-quality",
        )
        for f in sorted(qdq.field_coverage, key=lambda x: x.coverage_rate)
    ]

    # ── 各模块亮点（最多前 5 条，直接取自各子分析的排名/总览，不重新聚合）──────────
    top_customer_categories = [
        CustomerCategoryHighlight(
            customer_code=c.customer_code, customer_short_name=c.customer_short_name,
            top_category=c.top_category, style_count=c.style_count,
            top_category_share=c.top_category_share, target_module="/customer-category-styles",
        )
        for c in ccs.customer_rankings[:5]
    ]
    top_processes = [
        ProcessHighlight(
            process_tag=p.process_tag, is_special=p.is_special, application_count=p.application_count,
            customer_count=p.customer_count, target_module="/process-analysis",
        )
        for p in pa.process_rankings[:5]
    ]
    top_sizes = [
        SizeHighlight(
            size_code=s.size_code, is_special_size=s.is_special_size, application_count=s.application_count,
            customer_count=s.customer_count, target_module="/size-analysis",
        )
        for s in sa.size_rankings[:5]
    ]

    non_empty_buckets = [b for b in qa.quantity_distribution if b.quantity_bucket != "未填写" and b.style_count > 0]
    top_qty_bucket = max(non_empty_buckets, key=lambda b: b.style_count).quantity_bucket if non_empty_buckets else None
    quantity_distribution_highlights = [
        QuantityHighlight(
            top_quantity_bucket=top_qty_bucket,
            small_batch_style_count=qa.summary.small_batch_style_count,
            large_batch_style_count=qa.summary.large_batch_style_count,
            items_without_quantity=qa.summary.items_without_quantity,
            target_module="/quantity-analysis",
        )
    ]

    preparer_highlights = [
        PreparerHighlight(
            items_with_preparer=qp.summary.items_with_preparer,
            items_without_preparer=qp.summary.items_without_preparer,
            preparer_coverage_rate=qp.summary.preparer_coverage_rate,
            top_preparer=qp.summary.top_preparer.quote_prepared_by if qp.summary.top_preparer else None,
            top_preparer_style_count=qp.summary.top_preparer.style_count if qp.summary.top_preparer else None,
            target_module="/quote-preparer-analysis",
        )
    ]

    # ── 优先处理款式：合并六份 priority_items，按 item_id 去重，重新排序 ────────
    source_lists: dict[str, list] = {
        "quote_data_quality": qdq.priority_items,
        "customer_category": ccs.priority_items,
        "process": pa.priority_items,
        "size": sa.priority_items,
        "quantity": qa.priority_items,
        "preparer": qp.priority_items,
    }
    risk_sources = {"process", "size", "quantity"}

    merged: dict[str, dict[str, Any]] = {}
    for source_name, entries in source_lists.items():
        for e in entries:
            item_id = e.item_id
            rec = merged.setdefault(item_id, {
                "inquiry_id": e.inquiry_id, "inquiry_no": e.inquiry_no, "item_id": item_id,
                "customer_short_name": None, "responsible_sales": None,
                "product_name": None, "style_no": None, "inquiry_date": None,
                "order_status": None, "quote_status": None, "_risk_hints": set(),
            })
            rec["customer_short_name"] = rec["customer_short_name"] or e.customer_short_name
            rec["responsible_sales"] = rec["responsible_sales"] or getattr(e, "responsible_sales", None)
            rec["product_name"] = rec["product_name"] or e.product_name
            rec["style_no"] = rec["style_no"] or e.style_no
            rec["order_status"] = rec["order_status"] or getattr(e, "order_status", None)
            rec["quote_status"] = rec["quote_status"] or getattr(e, "quote_status", None)
            rec["inquiry_date"] = rec["inquiry_date"] or e.inquiry_date
            if source_name in risk_sources:
                hint = getattr(e, "risk_hint", "") or ""
                if hint:
                    rec["_risk_hints"].add(hint)

    # 精确判断"同时缺款号/工艺/尺码/填报人"——直接查原始 InquiryItem，不靠跨模块
    # 文本拼凑（各子分析的 missing_fields 文案措辞并不统一，拼不出可靠的交集）。
    raw_by_id: dict[str, InquiryItem] = {}
    if merged:
        item_uuids = [uuid.UUID(iid) for iid in merged]
        raw_rows = (await db.execute(
            select(InquiryItem)
            .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
            .where(InquiryItem.id.in_(item_uuids))
        )).scalars().all()
        raw_by_id = {str(r.id): r for r in raw_rows}

    priority_candidates = []
    for item_id, rec in merged.items():
        raw = raw_by_id.get(item_id)
        missing_fields: list[str] = []
        missing_all_four = False
        if raw:
            missing_style = not field_filled(raw, "style_no")
            missing_process = not (field_filled(raw, "process_description") or has_tags(raw))
            missing_size = not (field_filled(raw, "size_range") or has_standard_sizes(raw))
            missing_preparer = not has_preparer(raw)
            missing_quantity = raw.quantity is None
            if missing_style:
                missing_fields.append("款号")
            if missing_process:
                missing_fields.append("工艺")
            if missing_size:
                missing_fields.append("尺码")
            if missing_preparer:
                missing_fields.append("填报人")
            if missing_quantity:
                missing_fields.append("数量")
            missing_all_four = missing_style and missing_process and missing_size and missing_preparer

        order_priority_missing = bool(missing_fields) and rec["order_status"] in ORDER_PRIORITY_STATUSES
        quote_priority_missing = bool(missing_fields) and rec["quote_status"] in QUOTE_PRIORITY_STATUSES
        has_risk_hint = len(rec["_risk_hints"]) > 0
        risk_hint_display = "；".join(sorted(rec["_risk_hints"])) if rec["_risk_hints"] else (
            "缺失关键报价资料，建议补录" if missing_fields else ""
        )

        priority_candidates.append({
            **rec,
            "missing_fields": missing_fields,
            "risk_hint": risk_hint_display,
            "_order_priority_missing": order_priority_missing,
            "_quote_priority_missing": quote_priority_missing,
            "_missing_all_four": missing_all_four,
            "_has_risk_hint": has_risk_hint,
        })

    priority_candidates.sort(key=overview_priority_sort_key, reverse=True)

    priority_items = [
        OverviewPriorityItem(
            inquiry_id=c["inquiry_id"], inquiry_no=c["inquiry_no"], item_id=c["item_id"],
            customer_short_name=c["customer_short_name"], responsible_sales=c["responsible_sales"],
            product_name=c["product_name"], style_no=c["style_no"],
            missing_fields=c["missing_fields"], risk_hint=c["risk_hint"], inquiry_date=c["inquiry_date"],
        )
        for c in priority_candidates[:30]
    ]

    module_links = [ModuleLink(**m) for m in MODULE_LINKS]

    return QuoteAnalysisOverviewResponse(
        summary=summary,
        key_gaps=key_gaps,
        top_customer_categories=top_customer_categories,
        top_processes=top_processes,
        top_sizes=top_sizes,
        quantity_distribution_highlights=quantity_distribution_highlights,
        preparer_highlights=preparer_highlights,
        priority_items=priority_items,
        module_links=module_links,
    )
