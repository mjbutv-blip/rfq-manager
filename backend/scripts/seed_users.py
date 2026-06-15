"""
种子用户初始化脚本

用法（在 backend 目录执行）：
  python scripts/seed_users.py

已存在同名 username 的记录会跳过；可重复执行。
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User

USERS = [
    {
        "username":     "demo_admin",
        "display_name": "公司管理员",
        "role":         "admin",
        "group_name":   None,
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "a_leader",
        "display_name": "A组组长",
        "role":         "group_leader",
        "group_name":   "A组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "b_leader",
        "display_name": "B组组长",
        "role":         "group_leader",
        "group_name":   "B组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "sales_a1",
        "display_name": "王芳",
        "role":         "sales",
        "group_name":   "A组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "sales_a2",
        "display_name": "张伟",
        "role":         "sales",
        "group_name":   "A组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "sales_b1",
        "display_name": "李梅",
        "role":         "sales",
        "group_name":   "B组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "sales_b2",
        "display_name": "赵磊",
        "role":         "sales",
        "group_name":   "B组",
        "email":        None,
        "is_active":    True,
    },
    {
        "username":     "viewer_a",
        "display_name": "A组只读",
        "role":         "viewer",
        "group_name":   "A组",
        "email":        None,
        "is_active":    True,
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        created = 0
        skipped = 0
        for data in USERS:
            result = await db.execute(select(User).where(User.username == data["username"]))
            if result.scalar_one_or_none():
                skipped += 1
                print(f"  跳过（已存在）：{data['username']} / {data['display_name']}")
            else:
                db.add(User(**data))
                created += 1
                print(f"  创建：{data['username']} / {data['display_name']} / {data['role']}")
        await db.commit()
        print(f"\n完成：新建 {created} 个，跳过 {skipped} 个")


if __name__ == "__main__":
    asyncio.run(seed())
