"""
数据库状态检查脚本
用法：
  cd backend
  python scripts/check_db.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("✗ 未设置 DATABASE_URL，请检查 backend/.env")
    sys.exit(1)

engine = create_async_engine(DATABASE_URL, echo=False)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

TABLES = [
    "customers", "groups", "users",
    "inquiries", "inquiry_items",
    "import_batches", "import_rows",
]


async def check():
    print(f"DATABASE_URL: {DATABASE_URL[:40]}…")
    print()

    try:
        async with Session() as db:
            # 连通性
            await db.execute(text("SELECT 1"))
            print("✓ 数据库连接成功\n")

            # migration 版本
            r = await db.execute(text(
                "SELECT version_num FROM alembic_version LIMIT 1"
            ))
            row = r.fetchone()
            version = row[0] if row else "（无记录）"
            print(f"  Alembic 版本 : {version}")

            # 各表行数
            print()
            print("  表名                  行数")
            print("  " + "-" * 30)
            for table in TABLES:
                try:
                    r = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = r.scalar_one()
                    print(f"  {table:<22}{count:>5}")
                except Exception as e:
                    print(f"  {table:<22}  ✗ 表不存在或报错: {e}")

            # 索引概况
            print()
            r = await db.execute(text("""
                SELECT tablename, COUNT(*) AS idx_count
                FROM pg_indexes
                WHERE schemaname = 'public' AND indexname LIKE 'ix_%'
                GROUP BY tablename
                ORDER BY tablename
            """))
            rows = r.fetchall()
            if rows:
                print("  表名                  索引数")
                print("  " + "-" * 30)
                for tablename, idx_count in rows:
                    print(f"  {tablename:<22}{idx_count:>5}")
            else:
                print("  （未找到 ix_ 前缀索引）")

    except Exception as e:
        print(f"✗ 连接失败: {e}")
        sys.exit(1)

    print()
    print("✓ 检查完成")


if __name__ == "__main__":
    asyncio.run(check())
