import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db

router = APIRouter()

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


class ProfilePatch(BaseModel):
    name: str | None = None
    username: str | None = None


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "username": user.username,
        "active_sport": user.active_sport,
        "active_session_id": str(user.active_session_id) if user.active_session_id else None,
    }


@router.get("/me")
def get_me(user: User = Depends(current_user)) -> dict:
    return _serialize_user(user)


@router.patch("/me/profile")
def patch_profile(
    patch: ProfilePatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if patch.name is not None:
        user.name = patch.name.strip() or None
    if patch.username is not None:
        uname = patch.username.strip().lower()
        if not _USERNAME_RE.fullmatch(uname):
            raise HTTPException(400, "username must be 3-20 chars of a-z, 0-9, underscore")
        taken = db.execute(
            select(User.id).where(User.username == uname, User.id != user.id)
        ).first()
        if taken:
            raise HTTPException(409, "username taken")
        user.username = uname
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "username taken") from exc
    return _serialize_user(user)


@router.get("/me/username-available")
def username_available(
    u: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    uname = u.strip().lower()
    if not _USERNAME_RE.fullmatch(uname):
        return {"available": False}
    exists = db.execute(select(User.id).where(User.username == uname)).first()
    return {"available": exists is None}
