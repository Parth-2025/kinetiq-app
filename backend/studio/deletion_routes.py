"""Authenticated, bounded account-deletion request lifecycle.

Requests are queued for an operator; this module does not delete account data
or identity-provider records.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio.deletion_models import AccountDeletionRequest
from studio.models import AuditEvent

router = APIRouter(prefix="/studio", tags=["Performance Studio"])
CONFIRM_PHRASE = "DELETE MY ACCOUNT"


class DeletionRequestInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm_phrase: str = Field(min_length=1, max_length=40)


def _view(row: AccountDeletionRequest):
    return {
        "id": str(row.id),
        "status": row.status,
        "requested_at": row.requested_at.isoformat() if row.requested_at else None,
        "processed_at": row.processed_at.isoformat() if row.processed_at else None,
    }


@router.post("/account/deletion-request", status_code=201)
def request_account_deletion(body: DeletionRequestInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.confirm_phrase != CONFIRM_PHRASE:
        raise HTTPException(400, f'Type "{CONFIRM_PHRASE}" to confirm this request.')
    # Lock the user row to serialize concurrent first requests for this account.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).first()
    active = db.scalar(select(AccountDeletionRequest).where(
        AccountDeletionRequest.user_id == user.id,
        AccountDeletionRequest.status.in_(("pending", "processing")),
    ).order_by(AccountDeletionRequest.requested_at.desc()).limit(1))
    if active:
        return _view(active)
    row = AccountDeletionRequest(user_id=user.id, status="pending")
    db.add(row)
    db.flush()
    db.add(AuditEvent(actor_id=user.id, action="account.deletion_requested", resource_id=str(row.id), detail={"status": "pending"}))
    db.flush()
    return _view(row)


@router.get("/account/deletion-request")
def get_account_deletion_request(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id)
                     .order_by(AccountDeletionRequest.requested_at.desc()).limit(1))
    return _view(row) if row else {"id": None, "status": "none", "requested_at": None, "processed_at": None}


@router.delete("/account/deletion-request")
def cancel_account_deletion_request(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id)
                     .order_by(AccountDeletionRequest.requested_at.desc()).limit(1).with_for_update())
    if row is None or row.status != "pending":
        raise HTTPException(409, "Only a pending request can be canceled.")
    row.status = "canceled"
    db.add(AuditEvent(actor_id=user.id, action="account.deletion_request_canceled", resource_id=str(row.id), detail={"status": "canceled"}))
    db.flush()
    return _view(row)
