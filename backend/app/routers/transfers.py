import uuid
from pathlib import Path
from typing import Annotated

import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import UserDep, can_view_inquiry
from app.database import get_db
from app.models import Inquiry
from app.models.transfer_order import TransferOrder
from app.schemas.transfer import TransferOrderOut, TransferResponse
from app.services.transfer_service import detect_missing_fields, generate_transfer_files
from app.services.operation_log_service import log_kwargs_from_user, safe_log

router = APIRouter(tags=["transfers"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

_ALLOWED_STATUSES = {"下单", "已下单", "确认转单"}


def _can_transfer(inquiry: Inquiry, user) -> bool:
    """转单权限 = 非 viewer 且能查看该询单。"""
    if user.role == "viewer":
        return False
    return can_view_inquiry(inquiry, user)


# ── 生成转单文件 ──────────────────────────────────────────────────────────────

@router.post("/inquiries/{inquiry_id}/transfer", response_model=TransferResponse)
async def create_transfer(inquiry_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not _can_transfer(inq, user):
        raise HTTPException(status_code=403, detail="无权对该询单执行转单操作")
    if inq.order_status not in _ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="只有已下单或确认转单的询单可以转单",
        )

    try:
        factory_path, finance_path, _ts = generate_transfer_files(inq)
    except Exception as exc:
        transfer = TransferOrder(
            inquiry_id=inq.id,
            inquiry_no=inq.inquiry_no,
            transfer_status="failed",
            generated_by=user.display_name or user.username,
            remark=str(exc),
        )
        db.add(transfer)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"文件生成失败：{exc}") from exc

    # 存相对路径（相对于 backend/generated/）
    rel_factory = str(factory_path.relative_to(factory_path.parent.parent))
    rel_finance = str(finance_path.relative_to(finance_path.parent.parent))

    is_regenerated = (
        await db.execute(
            select(TransferOrder).where(TransferOrder.inquiry_id == inquiry_id)
        )
    ).first() is not None

    transfer = TransferOrder(
        inquiry_id=inq.id,
        inquiry_no=inq.inquiry_no,
        transfer_status="regenerated" if is_regenerated else "generated",
        generated_by=user.display_name or user.username,
        factory_contract_file=str(factory_path),
        finance_transfer_file=str(finance_path),
    )
    db.add(transfer)
    await db.flush()  # 获取 id
    await db.commit()
    await db.refresh(transfer)

    missing = detect_missing_fields(inq)
    if missing:
        msg = f"转单文件已生成，但部分字段缺失，请下载后补充检查：{'、'.join(missing)}"
    else:
        msg = "转单文件生成成功"

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="transfer_generate",
        target_type="transfer_order",
        target_id=str(transfer.id),
        inquiry_id=inq.id,
        inquiry_no=inq.inquiry_no,
        description="生成转单文件",
        after_data={
            "factory_contract_file": factory_path.name,
            "finance_transfer_file": finance_path.name,
            "generated_by": user.display_name or user.username,
            "missing_fields": missing,
        },
        request=request,
    )
    return TransferResponse(
        transfer_id=transfer.id,
        inquiry_no=inq.inquiry_no,
        factory_contract_url=f"/api/v1/transfers/{transfer.id}/factory-contract",
        finance_transfer_url=f"/api/v1/transfers/{transfer.id}/finance-transfer",
        missing_fields=missing,
        message=msg,
    )


# ── 下载文件 ───────────────────────────────────────────────────────────────────

async def _get_transfer_checked(transfer_id: uuid.UUID, user, db: AsyncSession) -> TransferOrder:
    """获取转单记录并检查查看权限。"""
    t = await db.get(TransferOrder, transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="转单记录不存在")
    inq = await db.get(Inquiry, t.inquiry_id)
    if not inq or not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该转单")
    return t


@router.get("/transfers/{transfer_id}/factory-contract")
async def download_factory_contract(transfer_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    t = await _get_transfer_checked(transfer_id, user, db)
    if not t.factory_contract_file:
        raise HTTPException(status_code=404, detail="工厂购销合同文件不存在")
    path = Path(t.factory_contract_file)
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件已删除或移动，请重新生成")
    encoded = urllib.parse.quote(path.name, safe="")
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="transfer_download",
        target_type="transfer_order",
        target_id=str(transfer_id),
        inquiry_id=t.inquiry_id,
        inquiry_no=t.inquiry_no,
        description="下载工厂购销合同",
        after_data={"file_type": "factory_contract", "file_name": path.name},
        request=request,
    )
    return FileResponse(
        path=str(path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.get("/transfers/{transfer_id}/finance-transfer")
async def download_finance_transfer(transfer_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    t = await _get_transfer_checked(transfer_id, user, db)
    if not t.finance_transfer_file:
        raise HTTPException(status_code=404, detail="财务转单统计表文件不存在")
    path = Path(t.finance_transfer_file)
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件已删除或移动，请重新生成")
    encoded = urllib.parse.quote(path.name, safe="")
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="transfer_download",
        target_type="transfer_order",
        target_id=str(transfer_id),
        inquiry_id=t.inquiry_id,
        inquiry_no=t.inquiry_no,
        description="下载财务转单统计表",
        after_data={"file_type": "finance_transfer", "file_name": path.name},
        request=request,
    )
    return FileResponse(
        path=str(path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── 转单历史 ──────────────────────────────────────────────────────────────────

@router.get("/inquiries/{inquiry_id}/transfers", response_model=list[TransferOrderOut])
async def get_inquiry_transfers(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权查看该询单")

    result = await db.execute(
        select(TransferOrder)
        .where(TransferOrder.inquiry_id == inquiry_id)
        .order_by(TransferOrder.generated_at.desc())
    )
    return [TransferOrderOut.model_validate(r) for r in result.scalars().all()]
