"""
快速种子脚本：写入 5 条示例询单数据（适配 v2 新 schema）
用法：
  cd backend
  python scripts/seed_v2.py
"""

import asyncio
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.models import Inquiry

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_async_engine(DATABASE_URL, echo=False)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

INQUIRIES = [
    dict(
        inquiry_no="BT-694",
        customer_code="BT",
        customer_order_no="168342",
        customer_name="BESTSELLER A/S",
        customer_short_name="BT",
        country="丹麦",
        region="欧洲",
        customer_category="欧洲零售商",
        group_name="A组",
        responsible_sales="李梅",
        assisting_sales="张云",
        product_category="内衣",
        product_name="男童平角裤",
        series_name="SS2026内衣系列",
        season="SS2026",
        quantity=12000,
        inquiry_date=date(2026, 1, 20),
        quote_status="已报价",
        order_status="下单",
        final_quote=2.38,
        factory_price=8.20,
        gross_profit_rate=18.0,
        order_unit_price=2.38,
        order_quantity=12000,
        trade_amount=28560.0,
        order_date=date(2026, 2, 15),
        inquiry_year=2026,
        inquiry_month="Jan",
    ),
    dict(
        inquiry_no="BT-699",
        customer_code="BT",
        customer_order_no="168343",
        customer_name="BESTSELLER A/S",
        customer_short_name="BT",
        country="丹麦",
        region="欧洲",
        customer_category="欧洲零售商",
        group_name="A组",
        responsible_sales="李梅",
        product_category="内衣",
        product_name="男童平角裤",
        series_name="SS2026内衣系列",
        season="SS2026",
        quantity=9000,
        inquiry_date=date(2026, 1, 25),
        quote_status="已报价",
        order_status="跟进中",
        final_quote=2.50,
        factory_price=8.40,
        gross_profit_rate=17.0,
        inquiry_year=2026,
        inquiry_month="Jan",
    ),
    dict(
        inquiry_no="GL-201",
        customer_code="GL",
        customer_order_no="GL20001",
        customer_name="GEORGE LEBANON",
        customer_short_name="GL",
        country="黎巴嫩",
        region="中东",
        customer_category="中东零售商",
        group_name="B组",
        responsible_sales="王芳",
        product_category="泳装",
        product_name="女士连体泳装",
        series_name="SS2026泳装系列",
        season="SS2026",
        quantity=5000,
        inquiry_date=date(2026, 1, 10),
        quote_status="已报价",
        order_status="下单",
        final_quote=5.20,
        factory_price=17.50,
        gross_profit_rate=20.0,
        order_unit_price=5.20,
        order_quantity=5000,
        trade_amount=26000.0,
        order_date=date(2026, 2, 1),
        inquiry_year=2026,
        inquiry_month="Jan",
    ),
    dict(
        inquiry_no="GL-205",
        customer_code="GL",
        customer_name="GEORGE LEBANON",
        customer_short_name="GL",
        country="黎巴嫩",
        region="中东",
        customer_category="中东零售商",
        group_name="B组",
        responsible_sales="王芳",
        product_category="泳装",
        product_name="女士比基尼套装",
        series_name="SS2026泳装系列",
        season="SS2026",
        quantity=3000,
        inquiry_date=date(2026, 2, 5),
        quote_status="已报价",
        order_status="跟进中",
        final_quote=4.20,
        factory_price=14.20,
        gross_profit_rate=16.5,
        inquiry_year=2026,
        inquiry_month="Feb",
    ),
    dict(
        inquiry_no="PR-088",
        customer_code="PR",
        customer_order_no="PR2026001",
        customer_name="PRIMARK LTD",
        customer_short_name="PR",
        country="英国",
        region="欧洲",
        customer_category="欧洲快时尚",
        group_name="A组",
        responsible_sales="李梅",
        assisting_sales="刘洋",
        product_category="内衣",
        product_name="女士文胸",
        season="AW2026",
        quantity=20000,
        inquiry_date=date(2026, 3, 1),
        quote_status="已报价",
        order_status="流失",
        final_quote=6.80,
        factory_price=22.0,
        gross_profit_rate=12.5,
        inquiry_year=2026,
        inquiry_month="Mar",
    ),
]


async def seed():
    async with Session() as db:
        for data in INQUIRIES:
            inq = Inquiry(**data)
            db.add(inq)
            await db.flush()
            print(f"  + {data['inquiry_no']}  {data['product_name']}  {data['order_status']}")
        await db.commit()
    print("\n完成，共写入 5 条询单。")

if __name__ == "__main__":
    asyncio.run(seed())
