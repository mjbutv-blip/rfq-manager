"""
一次性历史数据补录：早期导入的询单（在 inquiry_items 概念出现之前）从未
生成对应的款式明细，导致 Step 4-10 的所有报价资料分析（统计单位都是
inquiry_items）对这些历史询单完全看不到数据。

这个路由是临时的——只用于线上一次性回填，回填完成后会在后续提交里移除，
不作为长期功能保留。只给每个"目前一条 inquiry_item 都没有"的询单生成
1 条款式明细，字段直接照抄该询单自己已有的值（品名/品类/系列/数量/
报价状态/订单状态），不编造、不猜测任何新数据；已经有款式明细的询单
不受影响（幂等，可重复调用）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.permissions import UserDep
from app.database import AsyncSessionLocal
from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem

router = APIRouter(tags=["admin-backfill"])


@router.post("/admin/backfill-inquiry-items")
async def backfill_inquiry_items(user: UserDep):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行该操作")

    async with AsyncSessionLocal() as db:
        has_items_inq_ids = set(
            (await db.execute(select(InquiryItem.inquiry_id).distinct())).scalars().all()
        )
        all_inquiries = (await db.execute(select(Inquiry))).scalars().all()
        targets = [inq for inq in all_inquiries if inq.id not in has_items_inq_ids]

        created = 0
        for inq in targets:
            db.add(InquiryItem(
                inquiry_id=inq.id,
                inquiry_no=inq.inquiry_no,
                product_name=inq.product_name,
                product_category=inq.product_category,
                series_name=inq.series_name,
                quantity=inq.quantity,
                quote_status=inq.quote_status,
                order_status=inq.order_status,
            ))
            created += 1
        await db.commit()

    return {"total_inquiries": len(all_inquiries), "already_had_items": len(has_items_inq_ids), "created": created}
