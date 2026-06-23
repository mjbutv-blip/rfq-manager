"""
询单款式明细（inquiry_items）路由

权限规则复用 core.permissions 中对询单本身的判断（按明细所属的 inquiry 判断）：
  admin        → 可编辑全部
  group_leader → 可编辑本组询单的明细
  sales        → 可编辑自己负责或协助询单的明细
  viewer       → 只读
  未登录       → 401（由 get_current_user 依赖统一处理）
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import UserDep, can_edit_inquiry, can_view_inquiry
from app.database import get_db
from app.models.data_completion_task import DataCompletionTask
from app.models.inquiry_item import InquiryItem
from app.models.inquiry_item_process import InquiryItemProcess
from app.models.inquiry_item_size import InquiryItemSize
from app.schemas.inquiry_item import (
    InquiryItemProcessCreate,
    InquiryItemProcessRead,
    InquiryItemRead,
    InquiryItemSizeCreate,
    InquiryItemSizeRead,
    InquiryItemUpdate,
)
from app.services.data_completion_task_service import OPEN_STATUSES, auto_complete_check, now_utc
from app.services.operation_log_service import log_kwargs_from_user, safe_log, snapshot

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(prefix="/inquiry-items", tags=["inquiry-items"])

_ITEM_SNAPSHOT_FIELDS = (
    "style_no", "quote_prepared_by", "process_description", "size_range",
    "quantity", "product_name", "product_category", "series_name",
    "quote_status", "order_status", "remark", "extra_data",
)


async def _load_item(db: AsyncSession, item_id: uuid.UUID) -> InquiryItem | None:
    q = (
        select(InquiryItem)
        .where(InquiryItem.id == item_id)
        .options(
            selectinload(InquiryItem.inquiry),
            selectinload(InquiryItem.processes),
            selectinload(InquiryItem.sizes),
        )
    )
    return (await db.execute(q)).scalar_one_or_none()


async def _auto_check_completion_task(db: AsyncSession, item: InquiryItem, request) -> None:
    """
    款式资料编辑/工艺标签/尺码标签变更后，检查该款式是否有未关闭的补录任务，
    若任务创建时记录的目标缺失字段已经全部补齐，则自动完成该任务；只补齐
    一部分则只更新 missing_fields_json，不强行完成或重新打开已关闭的任务。
    失败只记日志，不影响款式资料本身已经保存成功的结果（见模块顶部说明的
    "自动检查失败不能影响用户保存资料"要求，与 _rescan_inquiry_warnings 同策略）。
    """
    try:
        task = (await db.execute(
            select(DataCompletionTask).where(
                DataCompletionTask.inquiry_item_id == item.id,
                DataCompletionTask.status.in_(OPEN_STATUSES),
            )
        )).scalars().first()
        if not task:
            return

        result = auto_complete_check(task, item)
        if not result["changed"]:
            return

        before_missing = list(task.missing_fields_json)
        if result["now_complete"]:
            task.status = "completed"
            task.missing_fields_json = []
            task.completed_at = now_utc()
            task.completed_by = "system"
            task.closed_reason = "自动完成：相关缺失字段已补齐"
            await db.commit()
            await safe_log(
                actor_username="system", actor_display_name="系统自动检查", actor_role=None,
                action_type="data_completion_task_auto_complete",
                target_type="data_completion_task",
                target_id=str(task.id),
                inquiry_id=task.inquiry_id,
                inquiry_no=item.inquiry_no,
                description="自动完成补录任务：相关缺失字段已补齐",
                before_data={"missing_fields": before_missing, "status": "open_or_in_progress"},
                after_data={"missing_fields": [], "status": "completed"},
                request=request,
            )
        else:
            task.missing_fields_json = result["still_missing"]
            await db.commit()
            await safe_log(
                actor_username="system", actor_display_name="系统自动检查", actor_role=None,
                action_type="data_completion_task_update",
                target_type="data_completion_task",
                target_id=str(task.id),
                inquiry_id=task.inquiry_id,
                inquiry_no=item.inquiry_no,
                description="自动更新补录任务缺失字段（部分已补齐）",
                before_data={"missing_fields": before_missing},
                after_data={"missing_fields": result["still_missing"]},
                request=request,
            )
    except Exception as exc:
        await db.rollback()
        logging.getLogger("rfq").error(
            "款式明细变更后自动检查补录任务失败（item_id=%s）：%s", item.id, exc,
        )


async def _rescan_inquiry_warnings(db: AsyncSession, inquiry) -> None:
    """
    款式明细新增/编辑/删除后，对所属询单重新跑一次现有的增量预警检查。
    增量扫描（run_check_for_inquiries）不会重复生成已存在的未处理预警；
    失败只记后端日志，不影响明细本身已经保存成功的结果。
    """
    from app.services.warning_service import run_check_for_inquiries
    try:
        await run_check_for_inquiries(db, [inquiry])
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logging.getLogger("rfq").error(
            "款式明细变更后重新扫描预警失败（inquiry_id=%s）：%s", inquiry.id, exc,
        )


@router.get("/{item_id}", response_model=InquiryItemRead)
async def get_item(item_id: uuid.UUID, db: DbDep, user: UserDep):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_view_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权访问该款式明细")
    return item


@router.patch("/{item_id}", response_model=InquiryItemRead)
async def update_item(
    item_id: uuid.UUID, body: InquiryItemUpdate, db: DbDep, user: UserDep, request: Request,
):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该款式明细")

    payload = body.model_dump(exclude_unset=True)
    # product_name 允许不传（不修改），但一旦传了就不能是空值——
    # exclude_unset 已经把"没传"和"显式传空"区分开了。
    if "product_name" in payload and not (payload["product_name"] or "").strip():
        raise HTTPException(status_code=422, detail="品名不能为空")
    # 不允许把明细挪到别的询单
    payload.pop("inquiry_id", None)

    before = snapshot(item, _ITEM_SNAPSHOT_FIELDS)
    for k, v in payload.items():
        setattr(item, k, v)
    await db.commit()

    fresh = await _load_item(db, item_id)
    after = snapshot(fresh, _ITEM_SNAPSHOT_FIELDS)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_update",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=fresh.inquiry_id,
        inquiry_no=fresh.inquiry_no,
        description="编辑询单款式明细",
        before_data=before,
        after_data=after,
        request=request,
    )
    await _rescan_inquiry_warnings(db, fresh.inquiry)
    await _auto_check_completion_task(db, fresh, request)
    return fresh


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    """
    删除一条款式明细。子表（工艺标签/尺码）通过外键 ON DELETE CASCADE +
    ORM 级联一并删除；不影响 inquiries 主记录（即使删完最后一条款式，
    询单本身仍保留——不做"自动删除空询单"）。
    """
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权删除该款式明细")

    inquiry = item.inquiry
    before = snapshot(item, _ITEM_SNAPSHOT_FIELDS)
    before["process_count"] = len(item.processes)
    before["size_count"] = len(item.sizes)

    await db.delete(item)
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_delete",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=inquiry.id,
        inquiry_no=inquiry.inquiry_no,
        description="删除询单款式明细",
        before_data=before,
        request=request,
    )
    await _rescan_inquiry_warnings(db, inquiry)


@router.post(
    "/{item_id}/processes", response_model=InquiryItemProcessRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_process(
    item_id: uuid.UUID, body: InquiryItemProcessCreate, db: DbDep, user: UserDep, request: Request,
):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该款式明细")

    tag = body.process_tag.strip()
    if not tag:
        raise HTTPException(status_code=422, detail="工艺标签不能为空")
    if any(p.process_tag.strip().lower() == tag.lower() for p in item.processes):
        raise HTTPException(status_code=409, detail=f"该款式下已存在工艺标签「{tag}」")

    process = InquiryItemProcess(
        inquiry_item_id=item_id, process_tag=tag,
        process_type=body.process_type, is_special=body.is_special,
    )
    db.add(process)
    await db.commit()
    await db.refresh(process)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_process_create",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=item.inquiry_id,
        inquiry_no=item.inquiry_no,
        description="添加款式工艺",
        after_data={"process_tag": process.process_tag, "is_special": process.is_special},
        request=request,
    )
    await _rescan_inquiry_warnings(db, item.inquiry)
    fresh_item = await _load_item(db, item_id)
    await _auto_check_completion_task(db, fresh_item, request)
    return process


@router.delete("/{item_id}/processes/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_process(
    item_id: uuid.UUID, process_id: uuid.UUID, db: DbDep, user: UserDep, request: Request,
):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该款式明细")

    process = next((p for p in item.processes if p.id == process_id), None)
    if not process:
        raise HTTPException(status_code=404, detail="工艺标签不存在")

    before = {"process_tag": process.process_tag, "is_special": process.is_special}
    await db.delete(process)
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_process_delete",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=item.inquiry_id,
        inquiry_no=item.inquiry_no,
        description="删除款式工艺",
        before_data=before,
        request=request,
    )
    await _rescan_inquiry_warnings(db, item.inquiry)
    fresh_item = await _load_item(db, item_id)
    await _auto_check_completion_task(db, fresh_item, request)


@router.post(
    "/{item_id}/sizes", response_model=InquiryItemSizeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_size(
    item_id: uuid.UUID, body: InquiryItemSizeCreate, db: DbDep, user: UserDep, request: Request,
):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该款式明细")

    code = body.size_code.strip().upper()
    if not code:
        raise HTTPException(status_code=422, detail="尺码不能为空")
    if any(s.size_code.strip().upper() == code for s in item.sizes):
        raise HTTPException(status_code=409, detail=f"该款式下已存在尺码「{code}」")

    size = InquiryItemSize(inquiry_item_id=item_id, size_code=code, is_special_size=body.is_special_size)
    db.add(size)
    await db.commit()
    await db.refresh(size)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_size_create",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=item.inquiry_id,
        inquiry_no=item.inquiry_no,
        description="添加款式尺码",
        after_data={"size_code": size.size_code, "is_special_size": size.is_special_size},
        request=request,
    )
    await _rescan_inquiry_warnings(db, item.inquiry)
    fresh_item = await _load_item(db, item_id)
    await _auto_check_completion_task(db, fresh_item, request)
    return size


@router.delete("/{item_id}/sizes/{size_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_size(
    item_id: uuid.UUID, size_id: uuid.UUID, db: DbDep, user: UserDep, request: Request,
):
    item = await _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    if not can_edit_inquiry(item.inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该款式明细")

    size = next((s for s in item.sizes if s.id == size_id), None)
    if not size:
        raise HTTPException(status_code=404, detail="尺码不存在")

    before = {"size_code": size.size_code, "is_special_size": size.is_special_size}
    await db.delete(size)
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_item_size_delete",
        target_type="inquiry_item",
        target_id=str(item_id),
        inquiry_id=item.inquiry_id,
        inquiry_no=item.inquiry_no,
        description="删除款式尺码",
        before_data=before,
        request=request,
    )
    await _rescan_inquiry_warnings(db, item.inquiry)
    fresh_item = await _load_item(db, item_id)
    await _auto_check_completion_task(db, fresh_item, request)
