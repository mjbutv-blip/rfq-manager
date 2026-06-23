"""
报价资料分析总览（统一入口）。

本模块刻意不重新查询或重新统计任何数据——总览页的所有数字都来自直接调用
Step 4-9 六个分析接口的本体函数（quote_data_quality / customer_category_styles /
process_analysis / size_analysis / quantity_analysis / quote_preparer_analysis），
确保总览卡片与各细分页面的口径百分之百一致，不会出现"总览说总数是 320，
点进详情页却是 318"这种割裂。

这里只新增两类真正属于"总览页自己的"逻辑：
  1. 字段覆盖率 -> 优先级（high/medium/low）的映射规则；
  2. 六个子分析接口各自的 priority_items 如何去重、合并展示字段、排序成
     一份"全局优先处理清单"。
"""

from __future__ import annotations

from datetime import date
from typing import Any

MODULE_LINKS: list[dict[str, str]] = [
    {"label": "报价资料完整度", "target_module": "/quote-data-quality"},
    {"label": "客户品类款式分析", "target_module": "/customer-category-styles"},
    {"label": "产品工艺分析", "target_module": "/process-analysis"},
    {"label": "尺码范围分析", "target_module": "/size-analysis"},
    {"label": "报价数量分析", "target_module": "/quantity-analysis"},
    {"label": "报价填报人分析", "target_module": "/quote-preparer-analysis"},
]


def priority_level(coverage_rate: float) -> str:
    """覆盖率 < 50%：high；50%-79%：medium；>= 80%：low。仅是资料完整度提醒，不是正式预警。"""
    if coverage_rate < 0.5:
        return "high"
    if coverage_rate < 0.8:
        return "medium"
    return "low"


def overview_priority_sort_key(entry: dict[str, Any]) -> tuple:
    """
    对应需求文档第六节 1-5 条规则，全部"值越大越靠前"，配合 sorted(..., reverse=True)：
      1. 已下单但缺关键资料；
      2. 已报价但缺关键资料；
      3. 同时缺款号、工艺、尺码、填报人；
      4. 有工艺/尺码/数量风险提示；
      5. 最近询单优先（询单日期）。
    """
    return (
        1 if entry["_order_priority_missing"] else 0,
        1 if entry["_quote_priority_missing"] else 0,
        1 if entry["_missing_all_four"] else 0,
        1 if entry["_has_risk_hint"] else 0,
        entry["inquiry_date"] or date.min,
    )
