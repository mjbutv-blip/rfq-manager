from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.permissions import UserDep, can_import
from app.database import get_db
from app.services.base_inquiry_import_service import (
    confirm_base_inquiry_import,
    preview_base_inquiry_import,
)
from app.services.operation_log_service import log_kwargs_from_user, safe_log

router = APIRouter(prefix="/base-inquiry-import", tags=["base-inquiry-import"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
ALLOWED_EXT = {".xlsx", ".xls"}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _validate(file: UploadFile) -> None:
    from pathlib import Path
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(422, detail=f"仅支持 Excel 文件（{', '.join(ALLOWED_EXT)}）")
    if file.size and file.size > MAX_BYTES:
        raise HTTPException(413, detail=f"文件不能超过 {settings.MAX_UPLOAD_SIZE_MB}MB")


@router.post("/preview")
async def preview(
    db: DbDep,
    user: UserDep,
    request: Request,
    file: UploadFile = File(...),
    uniform_customer_code: str | None = Form(default=None),
):
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限")
    _validate(file)
    file_bytes = await file.read()
    try:
        result = await preview_base_inquiry_import(
            db,
            file_bytes,
            file.filename or "unknown.xlsx",
            user,
            uniform_customer_code,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"文件解析失败：{exc}")

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="base_inquiry_import_preview",
        target_type="base_inquiry_import",
        description="预览基础询单 Excel 导入",
        after_data={
            "file_name": result["file_name"],
            "summary": result["summary"],
            "sheet_stats": result["sheet_stats"],
            "uniform_customer_code": result["uniform_customer_code"],
        },
        request=request,
    )
    return result


@router.post("/confirm")
async def confirm(
    db: DbDep,
    user: UserDep,
    file: UploadFile = File(...),
    uniform_customer_code: str | None = Form(default=None),
    confirmed_order_group_keys: str | None = Form(default=None),
):
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限")
    _validate(file)
    file_bytes = await file.read()
    try:
        group_keys = json.loads(confirmed_order_group_keys) if confirmed_order_group_keys else None
        if group_keys is not None and not isinstance(group_keys, list):
            raise ValueError("confirmed_order_group_keys 必须是数组")
        result = await confirm_base_inquiry_import(
            db,
            file_bytes,
            file.filename or "unknown.xlsx",
            user,
            uniform_customer_code,
            [str(k) for k in group_keys] if group_keys is not None else None,
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"导入失败：{exc}")
    return result
