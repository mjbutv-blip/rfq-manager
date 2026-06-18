"""
询单表字段映射配置
------------------
修改此文件即可适配不同的 Excel 模板，不需要改动解析代码。
"""

from __future__ import annotations

# ── Excel 中文表头 → 系统字段名 ────────────────────────────────────────────────
# 支持多个别名映射到同一字段；靠前的优先级更高
FIELD_MAPPING: dict[str, str] = {
    "询单号":       "inquiry_no",
    "客户代码":     "customer_code",
    "客户订单号":   "customer_order_no",
    "客户名称":     "customer_name",
    "客户全称":     "customer_name",
    "客户简称":     "customer_short_name",
    "国家/地区":    "country",
    "国家":         "country",
    "地区":         "region",
    "客户类别":     "customer_category",
    "所属小组":     "group_name",
    "小组":         "group_name",
    "负责业务员":   "responsible_sales",
    "业务员":       "responsible_sales",
    "协助业务员":   "assisting_sales",
    "产品大类":     "product_category",
    "品名":         "product_name",
    "产品名称":     "product_name",
    "系列":         "series_name",
    "系列名":       "series_name",
    "季节":         "season",
    "数量":         "quantity",
    "询单日期":     "inquiry_date",
    "报价情况":     "quote_status",
    "订单状态":     "order_status",
    "最终报价":     "final_quote",
    "报价":         "final_quote",
    "工厂价格":     "factory_price",
    "工厂价":       "factory_price",
    "工厂名称":     "factory_name",
    "工厂":         "factory_name",
    "毛利润率":     "gross_profit_rate",
    "毛利率":       "gross_profit_rate",
    "下单单价":     "order_unit_price",
    "下单数量":     "order_quantity",
    "贸易额":       "trade_amount",
    "下单日期":     "order_date",
    "备注":         "remark",
}

# ── 必填字段（缺失任意一个 → 该行标记为 failed）────────────────────────────────
# 注：responsible_sales 不在此列——无论 Excel 是否填写，都会被上传账号强制覆盖
# （见 excel_parser._parse_single_row 的 force_responsible_sales），不会缺失。
REQUIRED_FIELDS: list[str] = [
    "inquiry_no",
    "group_name",
    "product_name",
    "quantity",
    "inquiry_date",
]

# 客户标识：至少一个不能为空（同时缺失 → 该行标记为 failed）
CUSTOMER_IDENTITY_FIELDS: list[str] = ["customer_code", "customer_short_name"]

# ── 字段类型配置 ────────────────────────────────────────────────────────────────

# 整数字段
INT_FIELDS: frozenset[str] = frozenset({"quantity", "order_quantity"})

# 金额字段（Decimal，解析时保留原始精度）
DECIMAL_FIELDS: frozenset[str] = frozenset({
    "final_quote",
    "factory_price",
    "order_unit_price",
    "trade_amount",
})

# 百分比字段：支持 "18.5"、"18.5%"、"18.50%" 三种写法
# 统一不做 0.x → x*100 的自动换算，保持原始数字
PCT_FIELDS: frozenset[str] = frozenset({"gross_profit_rate"})

# 日期字段
DATE_FIELDS: frozenset[str] = frozenset({"inquiry_date", "order_date"})

# 所有数值类字段（用于辅助判断，不直接参与解析）
ALL_NUMERIC_FIELDS: frozenset[str] = INT_FIELDS | DECIMAL_FIELDS | PCT_FIELDS


# ── 正式报价单汇总模板（总表 sheet）专属字段映射 ────────────────────────────────
# 对应文件名形如 "TK-BTKU1005-1013报价单 德国(润东扬).xlsx"
# 表头在第 4 行，数据从第 5 行开始
# "FOB" 前缀匹配 "FOB厦门含税（...）" 列头
# 值为 FORMAL_SKIP 的列头不导入任何字段（防止子串误匹配）
FORMAL_SKIP = "__skip__"

FORMAL_TEMPLATE_FIELD_MAPPING: dict[str, str] = {
    "询单号":     "inquiry_no",
    "订单号":     "customer_order_no",
    "系列名":     "series_name",
    "系列":       "series_name",
    "季节":       "season",
    "品名":       "product_name",
    "产品名称":   "product_name",
    "样品数量":   FORMAL_SKIP,   # 防止"数量"子串误匹配到此列
    "数量":       "quantity",
    "报价情况":   "quote_status",
    "FOB":        "final_quote",   # 匹配 "FOB厦门含税..." 列头
    "原始翻单号": "remark",
}

# 正式模板宽松必填：日期/组别/业务员/客户标识由导入用户上下文补充，不强制要求在 Excel 中存在
FORMAL_REQUIRED_FIELDS: list[str] = ["inquiry_no", "product_name"]
