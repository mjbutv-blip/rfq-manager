"""
根据品名关键词自动判断产品大类。
规则：先匹配品类（内衣/泳衣），再检测童装关键词，组合成最终分类。
返回 None 表示无法识别，不强行填入。
"""

# 品类规则：顺序靠前的优先匹配
_TYPE_RULES: list[tuple[str, list[str]]] = [
    ("泳衣", [
        "泳衣", "泳装", "泳裤", "泳帽", "泳圈",
        "bikini", "比基尼", "swimwear", "swimsuit", "swim",
    ]),
    ("内衣", [
        "内衣", "文胸", "胸罩", "内裤", "睡衣", "家居服",
        "吊带", "塑身", "打底",
        "bra", "underwear", "lingerie", "brief", "panty",
        "nightwear", "sleepwear", "homewear",
    ]),
]

# 童装关键词
_CHILD_KEYWORDS: list[str] = [
    "童", "儿童", "幼儿", "幼童", "婴",
    "kids", "children", "child", "girls", "boys", "girl", "boy",
    "baby", "toddler", "infant",
]


def detect_product_category(product_name: str | None) -> str | None:
    """
    从品名推断产品大类。
    示例：
      "女童泳衣比基尼两件套" → "童装泳衣"
      "Women's Lace Bra"    → "内衣"
      "Boys Swim Trunk"     → "童装泳衣"
    """
    if not product_name:
        return None

    name_lower = product_name.lower()

    category_type: str | None = None
    for type_name, keywords in _TYPE_RULES:
        if any(kw.lower() in name_lower for kw in keywords):
            category_type = type_name
            break

    if not category_type:
        return None

    is_child = any(kw.lower() in name_lower for kw in _CHILD_KEYWORDS)
    return f"童装{category_type}" if is_child else category_type
