from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sample_record import SampleRecord


_SAMPLE_SNAPSHOT_FIELDS = (
    "sample_no", "sample_status", "final_result", "factory_due_date",
    "sample_sent_at", "customer_feedback", "revision_count",
    "sample_fee", "fee_paid_by", "fee_payment_status", "remark",
)


def _to_json(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    return v


def sample_snapshot(sample: SampleRecord) -> dict[str, Any]:
    return {f: _to_json(getattr(sample, f, None)) for f in _SAMPLE_SNAPSHOT_FIELDS}


async def generate_sample_no(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(SampleRecord))
    base = result.scalar_one()
    candidate = f"SP{base + 1:04d}"
    # Resolve conflicts (e.g. after deletions) by incrementing until unique
    from sqlalchemy import exists, literal
    while True:
        exists_q = select(literal(1)).where(SampleRecord.sample_no == candidate)
        if not (await db.execute(exists_q)).scalar():
            return candidate
        base += 1
        candidate = f"SP{base + 1:04d}"


async def get_sample_stats(db: AsyncSession, user=None) -> dict[str, Any]:
    """Return stats for all samples visible to the given user."""
    from app.models.sample_record import SampleRecord

    q = select(SampleRecord)
    if user and user.role != "admin":
        if user.role in ("group_leader", "viewer"):
            q = q.where(SampleRecord.group_name == user.group_name)
        elif user.role == "sales":
            names = [user.username]
            if user.display_name:
                names.append(user.display_name)
            q = q.where(SampleRecord.responsible_sales.in_(names))

    rows = list((await db.execute(q)).scalars().all())
    today = date.today()

    _terminal = {"approved", "rejected", "cancelled"}

    total = len(rows)
    making = sum(1 for r in rows if r.sample_status == "making")
    sent = sum(1 for r in rows if r.sample_status == "sent")
    approved = sum(1 for r in rows if r.sample_status == "approved")
    revision_needed = sum(1 for r in rows if r.sample_status == "revision_needed")
    overdue = sum(
        1 for r in rows
        if r.factory_due_date and r.factory_due_date < today
        and r.sample_status not in _terminal
        and r.sample_status != "sent"
    )
    # success_rate: approved / (approved + rejected) for terminal
    terminal_rows = [r for r in rows if r.final_result in ("approved", "rejected", "converted_to_order")]
    success_count = sum(1 for r in terminal_rows if r.final_result in ("approved", "converted_to_order"))
    success_rate = round(success_count / len(terminal_rows) * 100, 1) if terminal_rows else None

    # avg cycle: days from assigned_to_factory_at to sample_sent_at
    cycle_samples = [
        r for r in rows
        if r.assigned_to_factory_at and r.sample_sent_at
    ]
    avg_cycle = None
    if cycle_samples:
        total_days = sum((r.sample_sent_at - r.assigned_to_factory_at).days for r in cycle_samples)
        avg_cycle = round(total_days / len(cycle_samples), 1)

    company_fee = sum(
        float(r.sample_fee)
        for r in rows
        if r.fee_paid_by == "company" and r.sample_fee is not None
    )

    return {
        "total": total,
        "making": making,
        "sent": sent,
        "approved": approved,
        "revision_needed": revision_needed,
        "overdue": overdue,
        "success_rate": success_rate,
        "avg_cycle_days": avg_cycle,
        "company_fee_total": round(company_fee, 2),
    }
