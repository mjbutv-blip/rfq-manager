"""
根据品名（product_name）自动推断产品大类（product_category）。

只在真实生产数据已确认存在的 4 个类别内判断——内衣/泳衣/童装内衣/童装泳衣，
品类本质是"年龄段（成人/童装）× 大类（内衣/泳衣）"的二维组合，不是简单的
关键词对一个类别的映射。判断不出来就返回 None，不强行归类，也不识别这 4
个类别之外的新关键词（避免猜测出错误数据污染分析口径）。

调用方必须遵守"只填空白、不覆盖已有值"——本模块只负责推断，不做覆盖判断，
覆盖与否由调用方（路由层）根据当前字段是否已填写来决定。
"""

from __future__ import annotations

CHILD_KEYWORDS = ("童", "婴儿", "宝宝", "幼儿")
SWIM_KEYWORDS = ("泳", "比基尼")
UNDERWEAR_KEYWORDS = ("文胸", "内衣", "三角裤", "平角裤", "背心", "丁字裤", "高腰裤", "杯")


def infer_product_category(product_name: str | None) -> str | None:
    """
    顺序：先查泳类关键词（命中即按年龄段归入"泳衣"/"童装泳衣"，不再继续判断
    内衣类关键词——避免"女士固定杯比基尼泳装上衣"这种同时含"杯"又含"泳装"的
    品名被误判成内衣）；再查内衣类关键词；都没命中返回 None。
    """
    if not product_name:
        return None
    name = product_name.strip()
    if not name:
        return None

    is_child = any(k in name for k in CHILD_KEYWORDS)

    if any(k in name for k in SWIM_KEYWORDS):
        return "童装泳衣" if is_child else "泳衣"
    if any(k in name for k in UNDERWEAR_KEYWORDS):
        return "童装内衣" if is_child else "内衣"
    return None
