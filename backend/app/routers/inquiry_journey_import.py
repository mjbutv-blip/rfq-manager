from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.permissions import UserDep, can_import
from app.database import get_db
from app.services.inquiry_journey_import_service import (
    confirm_journey_import,
    preview_journey_import,
)
from app.services.operation_log_service import log_kwargs_from_user, safe_log

router = APIRouter(prefix="/inquiry-journey-import", tags=["inquiry-journey-import"])

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
):
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限")
    _validate(file)
    file_bytes = await file.read()
    try:
        result = await preview_journey_import(db, file_bytes, file.filename or "unknown.xlsx", user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"文件解析失败：{exc}")

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_journey_import_preview",
        target_type="inquiry_journey_import",
        description="预览来龙去脉 Excel 导入",
        after_data={
            "file_name": result["file_name"],
            "summary": result["summary"],
            "sheet_stats": result["sheet_stats"],
        },
        request=request,
    )
    return result


@router.post("/confirm")
async def confirm(
    db: DbDep,
    user: UserDep,
    request: Request,
    file: UploadFile = File(...),
    decisions: str = Form(default="{}"),
):
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限")
    _validate(file)
    try:
        parsed_decisions = json.loads(decisions or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="decisions 必须是合法 JSON")

    file_bytes = await file.read()
    try:
        result = await confirm_journey_import(
            db, file_bytes, file.filename or "unknown.xlsx", user, parsed_decisions
        )
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"导入失败：{exc}")

    return result
