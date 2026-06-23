"""
一次性历史数据补全：给品类为空、品名能判断出已知类别的款式明细自动填入
product_category。临时接口，只在这次线上回填用一次，用完即删，不作为长期
功能保留。幂等（只处理当前品类为空的记录，重复调用安全）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.permissions import UserDep
from app.database import AsyncSessionLocal
from app.models.inquiry_item import InquiryItem
from app.services.product_category_inference_service import infer_product_category

router = APIRouter(tags=["admin-backfill"])


@router.post("/admin/backfill-product-category")
async def backfill_product_category(user: UserDep):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行该操作")

    async with AsyncSessionLocal() as db:
        items = (await db.execute(select(InquiryItem))).scalars().all()
        checked = 0
        filled = 0
        for item in items:
            if (item.product_category or "").strip():
                continue
            checked += 1
            inferred = infer_product_category(item.product_name)
            if inferred:
                item.product_category = inferred
                filled += 1
        await db.commit()

    return {"checked": checked, "filled": filled, "left_blank": checked - filled}
