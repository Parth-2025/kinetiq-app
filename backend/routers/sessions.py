import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import AnalysisSession, User
from db.session import get_db

router = APIRouter()


class SessionCreate(BaseModel):
    sport: str
    source: dict = Field(default_factory=dict)
    analysis: dict = Field(default_factory=dict)


def _meta(s: AnalysisSession) -> dict:
    return {
        "id": str(s.id),
        "sport": s.sport,
        "overall_score": float(s.overall_score) if s.overall_score is not None else None,
        "created_at": s.created_at.isoformat(),
    }


def _full(s: AnalysisSession) -> dict:
    return {**_meta(s), "source": s.source, "analysis": s.analysis}


@router.post("/me/sessions")
def create_session(
    body: SessionCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    raw = body.analysis.get("overall_score")
    score = float(raw) if isinstance(raw, int | float) else None
    s = AnalysisSession(
        user_id=user.id, sport=body.sport, overall_score=score,
        source=body.source, analysis=body.analysis,
    )
    db.add(s)
    db.flush()
    user.active_session_id = s.id
    db.flush()
    return _meta(s)


@router.get("/me/sessions")
def list_sessions(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    sport: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    before: dt.datetime | None = None,
) -> list[dict]:
    q = select(AnalysisSession).where(AnalysisSession.user_id == user.id)
    if sport:
        q = q.where(AnalysisSession.sport == sport)
    if before:
        q = q.where(AnalysisSession.created_at < before)
    q = q.order_by(AnalysisSession.created_at.desc()).limit(limit)
    return [_meta(s) for s in db.execute(q).scalars().all()]


@router.get("/me/sessions/active")
def active_session(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict | None:
    if user.active_session_id is None:
        return None
    s = db.get(AnalysisSession, user.active_session_id)
    return _full(s) if s and s.user_id == user.id else None


@router.get("/me/sessions/{session_id}")
def get_session(
    session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    s = db.get(AnalysisSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "session not found")
    return _full(s)
