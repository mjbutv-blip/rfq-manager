import io
import urllib.parse
import uuid
from datetime import date as date_type, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.core.permissions import (
    UserDep,
    can_delete_inquiry,
    can_edit_inquiry,
    can_view_inquiry,
)
from app.database import get_db
from app.schemas.inquiry import InquiryFilter, InquiryListItem, InquiryUpdate
from app.services.export_service import build_inquiry_excel
from app.services.operation_log_service import (
    inquiry_delete_snapshot,
    inquiry_edit_snapshot,
    log_kwargs_from_user,
    safe_log,
)

router = APIRouter(prefix="/inquiries", tags=["inquiries"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


# ── 共享查询参数（list + export 复用）────────────────────────────────────────────

def _parse_filter(
    inquiry_no:          str | None = Query(None),
    customer_code:       str | None = Query(None),
    customer_short_name: str | None = Query(None),
    group_name:          str | None = Query(None),
    responsible_sales:   str | None = Query(None),
    assisting_sales:     str | None = Query(None),
    product_category:    str | None = Query(None),
    product_name:        str | None = Query(None),
    series_name:         str | None = Query(None),
    quote_status:        str | None = Query(None),
    order_status:        str | None = Query(None),
    season:              str | None = Query(None),
    year:                int | None = Query(None),
    month:               str | None = Query(None),
    start_date:          date_type | None = Query(None, description="询单日期起始（含），格式 YYYY-MM-DD"),
    end_date:            date_type | None = Query(None, description="询单日期截止（含），格式 YYYY-MM-DD"),
    sort_by:             str | None = Query(None, description="inquiry_date|trade_amount|created_at|inquiry_no"),
    sort_order:          str | None = Query("desc", description="asc|desc"),
    page:                int        = Query(1, ge=1),
    page_size:           int        = Query(50, ge=1, le=200),
) -> InquiryFilter:
    return InquiryFilter(
        inquiry_no=inquiry_no,
        customer_code=customer_code,
        customer_short_name=customer_short_name,
        group_name=group_name,
        responsible_sales=responsible_sales,
        assisting_sales=assisting_sales,
        product_category=product_category,
        product_name=product_name,
        series_name=series_name,
        quote_status=quote_status,
        order_status=order_status,
        season=season,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )


FilterDep = Annotated[InquiryFilter, Depends(_parse_filter)]


# ── 列表查询 ───────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_inquiries(db: DbDep, user: UserDep, f: FilterDep):
    """根据当前用户角色自动限定数据范围，支持多维度筛选 + 排序 + 分页。"""
    rows, total = await crud.list_inquiries(db, f, scope_user=user)
    return {
        "total": total,
        "page": f.page,
        "page_size": f.page_size,
        "items": [InquiryListItem.model_validate(r) for r in rows],
    }


# ── 导出 Excel（注意：必须在 /{inquiry_id} 路由之前注册，防止"export"被识别为 UUID）──

@router.get("/export")
async def export_inquiries(db: DbDep, user: UserDep, f: FilterDep, request: Request):
    """
    按当前筛选条件导出全量询单数据为 xlsx。
    权限范围与列表接口完全一致；不分页，返回所有匹配行。
    """
    rows = await crud.export_inquiries(db, f, scope_user=user)
    xlsx_bytes = build_inquiry_excel(rows)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"询单总表_{ts}.xlsx"
    encoded  = urllib.parse.quote(filename, safe="")

    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_export",
        target_type="export",
        description="导出询单总表",
        after_data={
            "file_name": filename,
            "exported_count": len(rows),
            "filters": {
                k: str(v) for k, v in f.model_dump().items()
                if v is not None and k not in ("page", "page_size")
            },
        },
        request=request,
    )

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}",
        },
    )


# ── 单条查询 ───────────────────────────────────────────────────────────────────

@router.get("/{inquiry_id}", response_model=InquiryListItem)
async def get_inquiry(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    from app.models import Inquiry
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权访问该询单")
    return inq


@router.patch("/{inquiry_id}", response_model=InquiryListItem)
async def update_inquiry(inquiry_id: uuid.UUID, body: InquiryUpdate, db: DbDep, user: UserDep, request: Request):
    from app.models import Inquiry
    from app.services.warning_service import scan_inquiry_warnings
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_edit_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权编辑该询单")
    before = inquiry_edit_snapshot(inq)
    updated = await crud.update_inquiry(db, inquiry_id, body.model_dump(exclude_none=True))
    fresh = await db.get(Inquiry, inquiry_id)
    if fresh:
        await scan_inquiry_warnings(db, fresh)
    await db.commit()
    # Must refresh after commit — expired ORM objects cause MissingGreenlet on serialization
    await db.refresh(updated)
    after = inquiry_edit_snapshot(updated)
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_update",
        target_type="inquiry",
        target_id=str(inquiry_id),
        inquiry_id=inquiry_id,
        inquiry_no=inq.inquiry_no,
        description="修改询单信息",
        before_data=before,
        after_data=after,
        request=request,
    )
    return updated


@router.get("/{inquiry_id}/warnings")
async def get_inquiry_warnings(inquiry_id: uuid.UUID, db: DbDep, user: UserDep):
    """获取单条询单的所有预警（含已处理）。"""
    from sqlalchemy import case, select
    from app.models import InquiryWarning
    from app.schemas.inquiry_warning import InquiryWarningOut
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    if not can_view_inquiry(inq, user):
        raise HTTPException(status_code=403, detail="无权查看该询单")
    level_order = case(
        (InquiryWarning.warning_level == "high",   1),
        (InquiryWarning.warning_level == "medium", 2),
        else_=3,
    )
    q = select(InquiryWarning).where(
        InquiryWarning.inquiry_id == inquiry_id
    ).order_by(InquiryWarning.is_resolved, level_order)
    rows = list((await db.execute(q)).scalars().all())
    return [InquiryWarningOut.model_validate(r) for r in rows]


@router.delete("/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inquiry(inquiry_id: uuid.UUID, db: DbDep, user: UserDep, request: Request):
    if not can_delete_inquiry(user):
        raise HTTPException(status_code=403, detail="只有管理员可以删除询单")
    from app.models import Inquiry
    inq = await db.get(Inquiry, inquiry_id)
    if not inq:
        raise HTTPException(status_code=404, detail="询单不存在")
    before = inquiry_delete_snapshot(inq)
    inq_no = inq.inquiry_no
    ok = await crud.delete_inquiry(db, inquiry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="询单不存在")
    await db.commit()
    await safe_log(
        **log_kwargs_from_user(user),
        action_type="inquiry_delete",
        target_type="inquiry",
        target_id=str(inquiry_id),
        inquiry_id=inquiry_id,
        inquiry_no=inq_no,
        description="删除询单",
        before_data=before,
        request=request,
    )
