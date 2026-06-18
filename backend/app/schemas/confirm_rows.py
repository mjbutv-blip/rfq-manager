from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ConfirmRowItem(BaseModel):
    row_number: int
    inquiry_no: str | None = None
    parsed_data: dict[str, Any]


class ConfirmRowsRequest(BaseModel):
    file_name: str
    rows: list[ConfirmRowItem]
    override_sales: str | None = None
