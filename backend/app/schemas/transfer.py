import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TransferOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    inquiry_id: uuid.UUID
    inquiry_no: str
    transfer_status: str
    generated_by: str
    generated_at: datetime
    factory_contract_file: str | None
    finance_transfer_file: str | None
    remark: str | None
    created_at: datetime
    updated_at: datetime


class TransferResponse(BaseModel):
    transfer_id: uuid.UUID
    inquiry_no: str
    factory_contract_url: str
    finance_transfer_url: str
    missing_fields: list[str]
    message: str
