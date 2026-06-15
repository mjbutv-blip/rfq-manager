from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.production_record import ProductionRecord

_SNAPSHOT_FIELDS = (
    "production_no", "production_status", "fabric_status", "accessory_status",
    "production_schedule_status", "first_inspection_status", "mid_inspection_status",
    "final_inspection_status", "delay_risk_level", "delay_reason",
    "delivery_date", "actual_finish_date", "merchandiser", "remark",
)

_TERMINAL_STATUSES = {"completed", "shipped", "cancelled"}


def _to_json(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    return v


def production_snapshot(rec: ProductionRecord) -> dict[str, Any]:
    return {f: _to_json(getattr(rec, f, None)) for f in _SNAPSHOT_FIELDS}


async def generate_production_no(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(ProductionRecord))
    base = result.scalar_one()
    candidate = f"PO{base + 1:04d}"
    from sqlalchemy import literal
    while True:
        exists_q = select(literal(1)).where(ProductionRecord.production_no == candidate)
        if not (await db.execute(exists_q)).scalar():
            return candidate
        base += 1
        candidate = f"PO{base + 1:04d}"


async def get_production_stats(db: AsyncSession, user=None) -> dict[str, Any]:
    q = select(ProductionRecord)
    if user and user.role != "admin":
        if user.role in ("group_leader", "viewer"):
            q = q.where(ProductionRecord.group_name == user.group_name)
        elif user.role == "sales":
            names = [user.username]
            if user.display_name:
                names.append(user.display_name)
            q = q.where(ProductionRecord.responsible_sales.in_(names))

    rows = list((await db.execute(q)).scalars().all())
    today = date.today()

    total = len(rows)
    in_production = sum(1 for r in rows if r.production_status == "in_production")
    overdue = sum(
        1 for r in rows
        if r.delivery_date and r.delivery_date < today
        and r.production_status not in _TERMINAL_STATUSES
    )
    high_risk = sum(1 for r in rows if r.delay_risk_level == "high")
    shipped = sum(1 for r in rows if r.production_status == "shipped")
    completed = sum(1 for r in rows if r.production_status in ("completed", "shipped"))

    return {
        "total": total,
        "in_production": in_production,
        "overdue": overdue,
        "high_risk": high_risk,
        "shipped": shipped,
        "completed": completed,
    }
