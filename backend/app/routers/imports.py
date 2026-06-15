import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.config import settings
from app.core.permissions import UserDep, can_import
from app.database import get_db
from app.models import ImportBatch
from app.schemas.import_batch import ImportBatchOut
from app.schemas.import_preview import ImportPreviewResult
from app.schemas.import_row import ImportRowOut
from app.schemas.confirm_rows import ConfirmRowsRequest
from app.services.import_service import confirm_import, confirm_import_rows, preview_import
from app.services.operation_log_service import log_kwargs_from_user, safe_log

router = APIRouter(prefix="/imports", tags=["imports"])

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


@router.post("/preview", response_model=ImportPreviewResult)
async def preview(
    db: DbDep,
    user: UserDep,
    request: Request,
    file: UploadFile = File(..., description="询单表 Excel"),
    preview_limit: int = Form(default=50, ge=1, le=200),
):
    """
    上传预览（不写库）。
    仅 admin 和 group_leader 可访问；group_leader 会看到跨组行被标记为失败。
    """
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限（仅管理员和组长可导入）")
    _validate(file)
    file_bytes = await file.read()
    try:
        result = await preview_import(
            db=db,
            file_bytes=file_bytes,
            file_name=file.filename or "unknown.xlsx",
            preview_limit=preview_limit,
            scope_user=user,
        )
        await safe_log(
            **log_kwargs_from_user(user),
            action_type="import_preview",
            target_type="import_batch",
            description="上传文件并生成导入预览",
            after_data={
                "file_name": result.file_name,
                "total_rows": result.total_rows,
                "new_rows": result.new_rows,
                "existing_rows": result.existing_rows,
                "failed_rows": result.failed_rows,
                "duplicate_rows": result.duplicate_rows,
            },
            request=request,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        raise HTTPException(400, detail=f"文件解析失败：{e}")


@router.post("/confirm", response_model=ImportBatchOut, status_code=status.HTTP_201_CREATED)
async def confirm(
    db: DbDep,
    user: UserDep,
    request: Request,
    file: UploadFile = File(..., description="询单表 Excel"),
):
    """
    确认导入（写库）。uploaded_by 自动取当前登录用户名。
    """
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限（仅管理员和组长可导入）")
    _validate(file)
    file_bytes = await file.read()
    try:
        batch_id = await confirm_import(
            db=db,
            file_bytes=file_bytes,
            file_name=file.filename or "unknown.xlsx",
            uploaded_by=user.username,
            scope_user=user,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        await db.rollback()
        raise HTTPException(400, detail=f"导入失败：{e}")

    batch = await crud.get_import_batch(db, batch_id)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="import_confirm",
        target_type="import_batch",
        target_id=str(batch_id),
        description="确认导入询单",
        after_data={
            "file_name": batch.file_name if batch else file.filename,
            "success_count": batch.success_count if batch else None,
            "fail_count": batch.fail_count if batch else None,
            "row_count": batch.row_count if batch else None,
        },
        request=request,
    )
    return batch


@router.post("/confirm-rows", response_model=ImportBatchOut, status_code=status.HTTP_201_CREATED)
async def confirm_rows(
    db: DbDep,
    user: UserDep,
    request: Request,
    body: ConfirmRowsRequest,
):
    """
    接收前端编辑后的行数据，直接写入（不重新解析 Excel）。
    适用于可编辑预览确认导入场景。
    """
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有导入权限（仅管理员和组长可导入）")
    try:
        batch_id = await confirm_import_rows(
            db=db,
            file_name=body.file_name,
            rows=[r.model_dump() for r in body.rows],
            uploaded_by=user.username,
            scope_user=user,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(400, detail=f"导入失败：{e}")

    batch = await crud.get_import_batch(db, batch_id)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="import_confirm",
        target_type="import_batch",
        target_id=str(batch_id),
        description="确认导入询单（行确认）",
        after_data={
            "file_name": body.file_name,
            "row_count": len(body.rows),
            "success_count": batch.success_count if batch else None,
        },
        request=request,
    )
    return batch


@router.get("", response_model=list[ImportBatchOut])
async def list_batches(
    db: DbDep,
    user: UserDep,
    limit: int = 20,
    offset: int = 0,
):
    """
    查询导入历史。
    admin 看全部；group_leader 只看自己上传的批次；其他角色 403。
    """
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有查看导入历史的权限")
    if user.role == "admin":
        return await crud.list_import_batches(db, limit=limit, offset=offset)
    # group_leader：只看自己上传的
    result = await db.execute(
        select(ImportBatch)
        .where(ImportBatch.uploaded_by == user.username)
        .order_by(ImportBatch.uploaded_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.get("/{batch_id}", response_model=ImportBatchOut)
async def get_batch(batch_id: uuid.UUID, db: DbDep, user: UserDep):
    """查询单个导入批次（需有导入权限）"""
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有查看导入历史的权限")
    batch = await crud.get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(404, detail="导入批次不存在")
    if user.role != "admin" and batch.uploaded_by != user.username:
        raise HTTPException(403, detail="无权查看他人的导入批次")
    return batch


@router.get("/{batch_id}/rows", response_model=list[ImportRowOut])
async def get_batch_rows(
    batch_id: uuid.UUID,
    db: DbDep,
    user: UserDep,
    status: str | None = Query(default=None, description="按状态筛选：new / exists / duplicate / error"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """查询某次导入的逐行日志（可按状态筛选）"""
    if not can_import(user):
        raise HTTPException(status_code=403, detail="没有查看导入历史的权限")
    batch = await crud.get_import_batch(db, batch_id)
    if not batch:
        raise HTTPException(404, detail="导入批次不存在")
    if user.role != "admin" and batch.uploaded_by != user.username:
        raise HTTPException(403, detail="无权查看他人的导入批次")
    return await crud.list_import_rows(db, batch_id, status=status, limit=limit, offset=offset)
