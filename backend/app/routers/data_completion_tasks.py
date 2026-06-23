"""
资料补录任务（报价资料分析 Step 10）

把分析页面发现的缺失资料转成可分配、可跟踪、可完成的任务。权限判断始终
基于任务关联的 inquiry（不是只看 assigned_to）：
  admin        → 查看/创建/分配/编辑/完成/取消全部任务
  group_leader → 仅本组询单对应任务；可分配，但只能分配给本组成员
  sales        → 仅自己负责/协助询单相关任务；只能编辑/完成分配给自己
                 （或尚未指派）的任务，不能把任务重新分配给别人
  viewer       → 只读查看自己权限范围内任务，不能创建/编辑/完成/取消
"""
from __future__ import annotations

import uuid
from datetime import date as date_type, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import UserDep, can_edit_inquiry, can_view_inquiry
from app.database import get_db
from app.models.data_completion_task import DataCompletionTask
from app.models.inquiry import Inquiry
from app.models.inquiry_item import InquiryItem
from app.models.user import User
from app.services.data_completion_task_service import (
    ALL_STATUSES,
    OPEN_STATUSES,
    PRIORITIES,
    auto_complete_check,
    compute_missing_fields,
    default_assignee,
    default_priority,
    is_open,
    now_utc,
)
from app.services.operation_log_service import log_kwargs_from_user, safe_log

DbDep = Annotated[AsyncSession, Depends(get_db)]
router = APIRouter(tags=["data-completion-tasks"])

ACTION_LABELS = {
    "data_completion_task_create": "创建补录任务",
    "data_completion_task_update": "更新补录任务",
    "data_completion_task_assign": "分配补录任务",
    "data_completion_task_start": "开始处理补录任务",
    "data_completion_task_complete": "完成补录任务",
    "data_completion_task_cancel": "取消补录任务",
    "data_completion_task_auto_complete": "自动完成补录任务",
}


# ── Pydantic 出入参（沿用 samples.py 的内联 schema 约定，不走 app/schemas 包）──

class DataCompletionTaskCreate(BaseModel):
    inquiry_item_id: uuid.UUID
    source_module: str
    source_reason: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    due_date: date_type | None = None
    remark: str | None = None


class DataCompletionTaskCreateBody(BaseModel):
    """POST /inquiry-items/{item_id}/data-completion-task 用，item_id 来自路径。"""
    source_module: str
    source_reason: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    due_date: date_type | None = None
    remark: str | None = None


class DataCompletionTaskUpdate(BaseModel):
    priority: str | None = None
    assigned_to: str | None = None
    status: str | None = None
    due_date: date_type | None = None
    remark: str | None = None


class DataCompletionTaskCompleteBody(BaseModel):
    remark: str | None = None


class DataCompletionTaskCancelBody(BaseModel):
    reason: str | None = None


class DataCompletionTaskOut(BaseModel):
    id: uuid.UUID
    inquiry_id: uuid.UUID
    inquiry_item_id: uuid.UUID
    task_type: str
    missing_fields_json: list[str]
    priority: str
    status: str
    assigned_to: str | None
    assigned_by: str | None
    created_by: str
    source_module: str
    source_reason: str | None
    remark: str | None
    due_date: date_type | None
    completed_at: datetime | None
    completed_by: str | None
    closed_reason: str | None
    created_at: datetime
    updated_at: datetime
    # 展示用扩展字段，组装响应时从关联的 inquiry/item 填充
    inquiry_no: str | None = None
    customer_short_name: str | None = None
    customer_code: str | None = None
    product_name: str | None = None
    style_no: str | None = None
    product_category: str | None = None
    responsible_sales: str | None = None
    group_name: str | None = None
    inquiry_date: date_type | None = None

    model_config = {"from_attributes": True}


class DataCompletionTaskCreateResponse(BaseModel):
    task: DataCompletionTaskOut
    created: bool


class DataCompletionTaskListResponse(BaseModel):
    items: list[DataCompletionTaskOut]
    total: int


# ── 内部工具 ────────────────────────────────────────────────────────────────────

def _names(user: User) -> set[str]:
    names = {user.username}
    if user.display_name:
        names.add(user.display_name)
    return names


def _to_out(task: DataCompletionTask, inquiry: Inquiry | None, item: InquiryItem | None) -> DataCompletionTaskOut:
    return DataCompletionTaskOut(
        id=task.id, inquiry_id=task.inquiry_id, inquiry_item_id=task.inquiry_item_id,
        task_type=task.task_type, missing_fields_json=task.missing_fields_json,
        priority=task.priority, status=task.status,
        assigned_to=task.assigned_to, assigned_by=task.assigned_by, created_by=task.created_by,
        source_module=task.source_module, source_reason=task.source_reason, remark=task.remark,
        due_date=task.due_date, completed_at=task.completed_at, completed_by=task.completed_by,
        closed_reason=task.closed_reason, created_at=task.created_at, updated_at=task.updated_at,
        inquiry_no=inquiry.inquiry_no if inquiry else None,
        customer_short_name=inquiry.customer_short_name if inquiry else None,
        customer_code=inquiry.customer_code if inquiry else None,
        product_name=item.product_name if item else None,
        style_no=item.style_no if item else None,
        product_category=(item.product_category if item else None) or (inquiry.product_category if inquiry else None),
        responsible_sales=inquiry.responsible_sales if inquiry else None,
        group_name=inquiry.group_name if inquiry else None,
        inquiry_date=inquiry.inquiry_date if inquiry else None,
    )


async def _load_task(db: AsyncSession, task_id: uuid.UUID) -> tuple[DataCompletionTask, Inquiry, InquiryItem] | None:
    task = await db.get(DataCompletionTask, task_id)
    if not task:
        return None
    inquiry = await db.get(Inquiry, task.inquiry_id)
    item = (await db.execute(
        select(InquiryItem)
        .where(InquiryItem.id == task.inquiry_item_id)
        .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
    )).scalar_one_or_none()
    return task, inquiry, item


def _can_edit_task(task: DataCompletionTask, inquiry: Inquiry, user: User) -> bool:
    """是否可以编辑任务一般字段（优先级/备注/截止日期）以及推进状态。"""
    if user.role == "viewer":
        return False
    if not can_edit_inquiry(inquiry, user):
        return False
    if user.role == "sales":
        # 业务员只能动"分配给自己"或"尚未指派"的任务，不能动别人的任务
        return not task.assigned_to or task.assigned_to in _names(user)
    return True  # admin / group_leader 在权限范围内可编辑任意任务


async def _check_reassign_allowed(db: AsyncSession, inquiry: Inquiry, target: str | None, user: User) -> str | None:
    """返回 None 表示允许；否则返回拒绝原因。"""
    if user.role == "viewer":
        return "viewer 不能分配任务"
    if not can_edit_inquiry(inquiry, user):
        return "无权操作该任务"
    if user.role == "sales":
        return "业务员不能重新分配任务负责人"
    if user.role == "group_leader" and target:
        target_user = (await db.execute(
            select(User).where((User.username == target) | (User.display_name == target))
        )).scalars().first()
        if target_user and target_user.group_name != user.group_name:
            return "组长只能把任务分配给本组成员"
    return None


async def _create_or_reuse_task(
    db: AsyncSession, user: User, item: InquiryItem, inquiry: Inquiry,
    source_module: str, source_reason: str | None,
    priority_override: str | None, assignee_override: str | None,
    due_date: date_type | None, remark: str | None, request: Request,
) -> DataCompletionTaskCreateResponse:
    existing = (await db.execute(
        select(DataCompletionTask).where(
            DataCompletionTask.inquiry_item_id == item.id,
            DataCompletionTask.status.in_(OPEN_STATUSES),
        )
    )).scalars().first()
    if existing:
        return DataCompletionTaskCreateResponse(task=_to_out(existing, inquiry, item), created=False)

    missing = compute_missing_fields(item)
    if not missing:
        raise HTTPException(status_code=400, detail="该款式资料已完整，无需创建补录任务")

    priority = priority_override if priority_override in PRIORITIES else default_priority(item, inquiry, missing)
    assignee = assignee_override if assignee_override else await default_assignee(db, item, inquiry)
    if assignee:
        assignee_user = (await db.execute(
            select(User).where((User.username == assignee) | (User.display_name == assignee))
        )).scalars().first()
        if assignee_user and assignee_user.role == "viewer":
            raise HTTPException(status_code=422, detail="不能把补录任务分配给只读账号（viewer）")

    task = DataCompletionTask(
        inquiry_id=inquiry.id, inquiry_item_id=item.id,
        missing_fields_json=missing, priority=priority, status="open",
        assigned_to=assignee, assigned_by=(user.username if assignee else None),
        created_by=user.username, source_module=source_module, source_reason=source_reason,
        remark=remark, due_date=due_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="data_completion_task_create",
        target_type="data_completion_task",
        target_id=str(task.id),
        inquiry_id=inquiry.id,
        inquiry_no=inquiry.inquiry_no,
        description=f"创建补录任务（来源：{source_module}），缺失字段：{', '.join(missing)}",
        after_data={
            "task_id": str(task.id), "inquiry_item_id": str(item.id), "assigned_to": assignee,
            "status": "open", "priority": priority, "missing_fields": missing,
        },
        request=request,
    )
    return DataCompletionTaskCreateResponse(task=_to_out(task, inquiry, item), created=True)


# ── 列表 / 详情 ─────────────────────────────────────────────────────────────────

@router.get("/data-completion-tasks", response_model=DataCompletionTaskListResponse)
async def list_tasks(
    db: DbDep, user: UserDep,
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    assigned_to: str | None = Query(None),
    group_name: str | None = Query(None),
    customer_code: str | None = Query(None),
    responsible_sales: str | None = Query(None),
    created_start: date_type | None = Query(None),
    created_end: date_type | None = Query(None),
    due_start: date_type | None = Query(None),
    due_end: date_type | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = select(DataCompletionTask).join(Inquiry, DataCompletionTask.inquiry_id == Inquiry.id)
    from app.core.permissions import apply_inquiry_scope
    q = apply_inquiry_scope(q, user)

    if status_filter:
        q = q.where(DataCompletionTask.status == status_filter)
    if priority:
        q = q.where(DataCompletionTask.priority == priority)
    if assigned_to:
        q = q.where(DataCompletionTask.assigned_to == assigned_to)
    if group_name:
        q = q.where(Inquiry.group_name == group_name)
    if customer_code:
        q = q.where(Inquiry.customer_code == customer_code)
    if responsible_sales:
        q = q.where(Inquiry.responsible_sales == responsible_sales)
    if created_start:
        q = q.where(DataCompletionTask.created_at >= created_start)
    if created_end:
        q = q.where(DataCompletionTask.created_at <= created_end)
    if due_start:
        q = q.where(DataCompletionTask.due_date >= due_start)
    if due_end:
        q = q.where(DataCompletionTask.due_date <= due_end)

    rows = (await db.execute(q.order_by(DataCompletionTask.created_at.desc()))).scalars().all()
    total = len(rows)
    page_rows = rows[(page - 1) * page_size: page * page_size]

    inq_ids = {t.inquiry_id for t in page_rows}
    item_ids = {t.inquiry_item_id for t in page_rows}
    inquiries: dict[Any, Inquiry] = {}
    items: dict[Any, InquiryItem] = {}
    if inq_ids:
        inquiries = {i.id: i for i in (await db.execute(select(Inquiry).where(Inquiry.id.in_(inq_ids)))).scalars().all()}
    if item_ids:
        items = {i.id: i for i in (await db.execute(select(InquiryItem).where(InquiryItem.id.in_(item_ids)))).scalars().all()}

    return DataCompletionTaskListResponse(
        items=[_to_out(t, inquiries.get(t.inquiry_id), items.get(t.inquiry_item_id)) for t in page_rows],
        total=total,
    )


@router.get("/data-completion-tasks/{task_id}", response_model=DataCompletionTaskOut)
async def get_task(task_id: uuid.UUID, db: DbDep, user: UserDep):
    loaded = await _load_task(db, task_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="任务不存在")
    task, inquiry, item = loaded
    if not can_view_inquiry(inquiry, user):
        raise HTTPException(status_code=403, detail="无权查看该任务")
    return _to_out(task, inquiry, item)


@router.get("/inquiry-items/{item_id}/data-completion-task", response_model=DataCompletionTaskOut | None)
async def get_active_task_for_item(item_id: uuid.UUID, db: DbDep, user: UserDep):
    """供询单详情页查询某款式当前是否有未关闭任务，没有则返回 null。"""
    item = await db.get(InquiryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    inquiry = await db.get(Inquiry, item.inquiry_id)
    if not inquiry or not can_view_inquiry(inquiry, user):
        raise HTTPException(status_code=403, detail="无权查看该款式")

    task = (await db.execute(
        select(DataCompletionTask).where(
            DataCompletionTask.inquiry_item_id == item_id,
            DataCompletionTask.status.in_(OPEN_STATUSES),
        )
    )).scalars().first()
    if not task:
        return None
    return _to_out(task, inquiry, item)


# ── 创建 ────────────────────────────────────────────────────────────────────────

@router.post("/data-completion-tasks", response_model=DataCompletionTaskCreateResponse, status_code=201)
async def create_task(body: DataCompletionTaskCreate, db: DbDep, user: UserDep, request: Request):
    item = (await db.execute(
        select(InquiryItem).where(InquiryItem.id == body.inquiry_item_id)
        .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    inquiry = await db.get(Inquiry, item.inquiry_id)
    if not inquiry or not can_edit_inquiry(inquiry, user):
        raise HTTPException(status_code=403, detail="无权为该款式创建补录任务")

    return await _create_or_reuse_task(
        db, user, item, inquiry, body.source_module, body.source_reason,
        body.priority, body.assigned_to, body.due_date, body.remark, request,
    )


@router.post(
    "/inquiry-items/{item_id}/data-completion-task",
    response_model=DataCompletionTaskCreateResponse, status_code=201,
)
async def create_task_for_item(
    item_id: uuid.UUID, body: DataCompletionTaskCreateBody, db: DbDep, user: UserDep, request: Request,
):
    """便捷接口：从任意分析页面的"创建补录任务"按钮直接创建，只需要 item_id。"""
    item = (await db.execute(
        select(InquiryItem).where(InquiryItem.id == item_id)
        .options(selectinload(InquiryItem.processes), selectinload(InquiryItem.sizes))
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="款式明细不存在")
    inquiry = await db.get(Inquiry, item.inquiry_id)
    if not inquiry or not can_edit_inquiry(inquiry, user):
        raise HTTPException(status_code=403, detail="无权为该款式创建补录任务")

    return await _create_or_reuse_task(
        db, user, item, inquiry, body.source_module, body.source_reason,
        body.priority, body.assigned_to, body.due_date, body.remark, request,
    )


# ── 更新 / 完成 / 取消 ───────────────────────────────────────────────────────────

@router.patch("/data-completion-tasks/{task_id}", response_model=DataCompletionTaskOut)
async def update_task(task_id: uuid.UUID, body: DataCompletionTaskUpdate, db: DbDep, user: UserDep, request: Request):
    loaded = await _load_task(db, task_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="任务不存在")
    task, inquiry, item = loaded

    payload = body.model_dump(exclude_unset=True)
    reassigning = "assigned_to" in payload and payload["assigned_to"] != task.assigned_to

    if reassigning:
        reject_reason = await _check_reassign_allowed(db, inquiry, payload["assigned_to"], user)
        if reject_reason:
            raise HTTPException(status_code=403, detail=reject_reason)
        if payload["assigned_to"]:
            assignee_user = (await db.execute(
                select(User).where((User.username == payload["assigned_to"]) | (User.display_name == payload["assigned_to"]))
            )).scalars().first()
            if assignee_user and assignee_user.role == "viewer":
                raise HTTPException(status_code=422, detail="不能把补录任务分配给只读账号（viewer）")
    elif not _can_edit_task(task, inquiry, user):
        raise HTTPException(status_code=403, detail="无权编辑该任务")

    if "status" in payload and payload["status"] not in ALL_STATUSES:
        raise HTTPException(status_code=422, detail=f"无效状态：{payload['status']}")
    if "priority" in payload and payload["priority"] not in PRIORITIES:
        raise HTTPException(status_code=422, detail=f"无效优先级：{payload['priority']}")
    if task.status not in OPEN_STATUSES and ("status" in payload and payload["status"] in OPEN_STATUSES):
        raise HTTPException(status_code=400, detail="已完成或已取消的任务不能重新打开")

    before_status = task.status
    before_assigned = task.assigned_to

    for k, v in payload.items():
        setattr(task, k, v)
    if reassigning:
        task.assigned_by = user.username if task.assigned_to else None

    await db.commit()
    await db.refresh(task)

    action_type = "data_completion_task_update"
    if reassigning:
        action_type = "data_completion_task_assign"
    elif "status" in payload and payload["status"] == "in_progress" and before_status != "in_progress":
        action_type = "data_completion_task_start"

    await safe_log(
        **log_kwargs_from_user(user),
        action_type=action_type,
        target_type="data_completion_task",
        target_id=str(task.id),
        inquiry_id=inquiry.id,
        inquiry_no=inquiry.inquiry_no,
        description=ACTION_LABELS[action_type],
        before_data={"status": before_status, "assigned_to": before_assigned},
        after_data={"status": task.status, "assigned_to": task.assigned_to, "priority": task.priority},
        request=request,
    )
    return _to_out(task, inquiry, item)


@router.post("/data-completion-tasks/{task_id}/complete", response_model=DataCompletionTaskOut)
async def complete_task(task_id: uuid.UUID, body: DataCompletionTaskCompleteBody, db: DbDep, user: UserDep, request: Request):
    loaded = await _load_task(db, task_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="任务不存在")
    task, inquiry, item = loaded
    if not _can_edit_task(task, inquiry, user):
        raise HTTPException(status_code=403, detail="无权完成该任务")
    if task.status not in OPEN_STATUSES:
        raise HTTPException(status_code=400, detail="只有未关闭的任务可以完成")

    before_status = task.status
    task.status = "completed"
    task.completed_at = now_utc()
    task.completed_by = user.username
    task.closed_reason = "人工标记完成"
    if body.remark:
        task.remark = body.remark
    await db.commit()
    await db.refresh(task)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="data_completion_task_complete",
        target_type="data_completion_task",
        target_id=str(task.id),
        inquiry_id=inquiry.id,
        inquiry_no=inquiry.inquiry_no,
        description="人工完成补录任务",
        before_data={"status": before_status},
        after_data={"status": "completed", "closed_reason": task.closed_reason},
        request=request,
    )
    return _to_out(task, inquiry, item)


@router.post("/data-completion-tasks/{task_id}/cancel", response_model=DataCompletionTaskOut)
async def cancel_task(task_id: uuid.UUID, body: DataCompletionTaskCancelBody, db: DbDep, user: UserDep, request: Request):
    loaded = await _load_task(db, task_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="任务不存在")
    task, inquiry, item = loaded
    if not _can_edit_task(task, inquiry, user):
        raise HTTPException(status_code=403, detail="无权取消该任务")
    if task.status not in OPEN_STATUSES:
        raise HTTPException(status_code=400, detail="只有未关闭的任务可以取消")

    before_status = task.status
    task.status = "cancelled"
    task.closed_reason = body.reason or "人工取消"
    await db.commit()
    await db.refresh(task)

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="data_completion_task_cancel",
        target_type="data_completion_task",
        target_id=str(task.id),
        inquiry_id=inquiry.id,
        inquiry_no=inquiry.inquiry_no,
        description="取消补录任务",
        before_data={"status": before_status},
        after_data={"status": "cancelled", "closed_reason": task.closed_reason},
        request=request,
    )
    return _to_out(task, inquiry, item)
