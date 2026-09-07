from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User, UserSport
from db.session import get_db

router = APIRouter()


class SportBody(BaseModel):
    sport: str


def _state(db: Session, user: User) -> dict:
    selected = db.execute(
        select(UserSport.sport).where(UserSport.user_id == user.id).order_by(UserSport.sport)
    ).scalars().all()
    return {"active": user.active_sport, "selected": list(selected)}


@router.get("/me/sports")
def get_sports(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return _state(db, user)


@router.post("/me/sports/selected")
def add_sport(
    body: SportBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    exists = db.execute(
        select(UserSport).where(UserSport.user_id == user.id, UserSport.sport == body.sport)
    ).scalar_one_or_none()
    if exists is None:
        db.add(UserSport(user_id=user.id, sport=body.sport))
        if user.active_sport is None:
            user.active_sport = body.sport
        db.flush()
    return _state(db, user)


@router.put("/me/sports/active")
def set_active(
    body: SportBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    selected = db.execute(
        select(UserSport.sport).where(UserSport.user_id == user.id)
    ).scalars().all()
    if body.sport not in selected:
        raise HTTPException(400, "sport is not in your selected list")
    user.active_sport = body.sport
    db.flush()
    return _state(db, user)


@router.delete("/me/sports/selected/{sport}")
def remove_sport(
    sport: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    db.execute(
        delete(UserSport).where(UserSport.user_id == user.id, UserSport.sport == sport)
    )
    if user.active_sport == sport:
        remaining = db.execute(
            select(UserSport.sport).where(UserSport.user_id == user.id).order_by(UserSport.sport)
        ).scalars().first()
        user.active_sport = remaining
    db.flush()
    return _state(db, user)
