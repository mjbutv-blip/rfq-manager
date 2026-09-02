from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep
from app.database import get_db
from app.models import Inquiry, InquiryItem
from app.services.base_inquiry_import_service import _parse_workbook
from app.services.excel_image_service import extract_excel_row_images


router = APIRouter(prefix="/inquiry-images", tags=["inquiry-images"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/backfill")
async def backfill_inquiry_images(
    db: DbDep,
    user: UserDep,
    file: UploadFile = File(...),
    apply: bool = Form(False),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可批量回填询单图片")
    filename = file.filename or "quotation.xlsx"
    if not filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="仅支持 .xlsx/.xlsm")
    content = await file.read()
    if len(content) > 30 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件不能超过 30MB")
    try:
        images = extract_excel_row_images(content, {"总表", "总表海外", "海外报价表-美金"})
        rows, *_ = _parse_workbook(content, file_name=filename)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"图片解析失败：{exc}") from exc

    summary = {
        "file_name": filename,
        "apply": apply,
        "excel_images": len(images),
        "image_rows": 0,
        "matched": 0,
        "would_update": 0,
        "updated": 0,
        "already_present": 0,
        "missing_inquiry": 0,
        "created_items": 0,
    }
    seen: set[tuple[str, str, int]] = set()
    for row in rows:
        image = images.get((row.source_sheet, row.row_number))
        if not image or not row.inquiry_no:
            continue
        key = (row.inquiry_no, row.source_sheet, row.row_number)
        if key in seen:
            continue
        seen.add(key)
        summary["image_rows"] += 1
        inquiry = (await db.execute(select(Inquiry).where(Inquiry.inquiry_no == row.inquiry_no))).scalars().first()
        if inquiry is None:
            summary["missing_inquiry"] += 1
            continue
        items = (await db.execute(
            select(InquiryItem).where(InquiryItem.inquiry_id == inquiry.id).order_by(InquiryItem.created_at)
        )).scalars().all()
        item = next((it for it in items if (it.extra_data or {}).get("source_sheet") == row.source_sheet and (it.extra_data or {}).get("source_row") == row.row_number), None)
        item = item or next((it for it in items if row.style_no and it.style_no == row.style_no), None)
        item = item or (items[0] if items else None)
        summary["matched"] += 1
        if item is not None and (item.extra_data or {}).get("image_data_url"):
            summary["already_present"] += 1
            continue
        summary["would_update"] += 1
        if not apply:
            continue
        if item is None:
            item = InquiryItem(
                id=uuid.uuid4(), inquiry_id=inquiry.id, inquiry_no=inquiry.inquiry_no,
                product_name=row.product_name, product_category=row.product_category,
                series_name=row.series_name, quantity=row.quantity, extra_data={},
            )
            db.add(item)
            await db.flush()
            summary["created_items"] += 1
        item.extra_data = {
            **(item.extra_data or {}),
            "image_data_url": image,
            "image_source_file": filename,
            "image_source_sheet": row.source_sheet,
            "image_source_row": row.row_number,
        }
        summary["updated"] += 1
    if apply:
        await db.commit()
    else:
        await db.rollback()
    return summary
