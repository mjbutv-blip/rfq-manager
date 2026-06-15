"""
操作日志服务

设计原则：
  - safe_log() 永远不抛异常，日志写入失败只打印 stderr，不影响主业务
  - 使用独立 DB 会话写入，确保主事务回滚时日志仍可写入
  - before_data / after_data 只保留关键字段，序列化为 JSON-safe dict
"""

import logging
import uuid as _uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.database import AsyncSessionLocal
from app.models.operation_log import OperationLog

logger = logging.getLogger("rfq")

# 询单编辑时快照的关键字段
_INQUIRY_EDIT_FIELDS = (
    "quote_status", "order_status", "final_quote", "factory_price",
    "gross_profit_rate", "order_unit_price", "order_quantity",
    "trade_amount", "order_date", "remark",
)

# 询单删除时快照的关键字段（更全）
_INQUIRY_DELETE_FIELDS = (
    "inquiry_no", "customer_short_name", "customer_name", "group_name",
    "responsible_sales", "product_name", "order_status", "quote_status",
    "order_unit_price", "order_quantity", "trade_amount", "factory_price",
)


def _to_json(v: Any) -> Any:
    """把单个值转换为 JSON 可序列化类型。"""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, _uuid.UUID):
        return str(v)
    return v


def snapshot(obj, fields: tuple[str, ...]) -> dict[str, Any]:
    """从 ORM 对象中提取指定字段，返回 JSON-safe dict。"""
    return {f: _to_json(getattr(obj, f, None)) for f in fields}


def inquiry_edit_snapshot(inq) -> dict[str, Any]:
    return snapshot(inq, _INQUIRY_EDIT_FIELDS)


def inquiry_delete_snapshot(inq) -> dict[str, Any]:
    return snapshot(inq, _INQUIRY_DELETE_FIELDS)


def _request_context(request) -> tuple[str | None, str | None, str | None]:
    """从 FastAPI Request 对象提取 (path, method, ip)。"""
    if request is None:
        return None, None, None
    try:
        path   = str(request.url.path)
        method = request.method
        ip     = request.client.host if request.client else None
        return path, method, ip
    except Exception:
        return None, None, None


async def safe_log(
    *,
    actor_username: str,
    actor_display_name: str | None = None,
    actor_role: str | None = None,
    action_type: str,
    target_type: str | None = None,
    target_id: Any = None,
    inquiry_id: Any = None,
    inquiry_no: str | None = None,
    description: str | None = None,
    before_data: dict | None = None,
    after_data: dict | None = None,
    request=None,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    """
    写入操作日志（独立 DB 会话）。
    永远不抛异常，失败只打印 error log。
    """
    try:
        path, method, ip = _request_context(request)

        log = OperationLog(
            actor_username=actor_username,
            actor_display_name=actor_display_name,
            actor_role=actor_role,
            action_type=action_type,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            inquiry_id=inquiry_id if isinstance(inquiry_id, (_uuid.UUID, type(None))) else _uuid.UUID(str(inquiry_id)),
            inquiry_no=inquiry_no,
            description=description,
            before_data_json=before_data,
            after_data_json=after_data,
            request_path=path,
            request_method=method,
            ip_address=ip,
            status=status,
            error_message=error_message,
        )

        async with AsyncSessionLocal() as db:
            db.add(log)
            await db.commit()

    except Exception as exc:
        logger.error("operation_log write failed: %s", exc)


def log_kwargs_from_user(user) -> dict:
    """从 User ORM 对象提取日志所需字段。"""
    return {
        "actor_username":     user.username if user else "system",
        "actor_display_name": user.display_name if user else None,
        "actor_role":         user.role if user else None,
    }
