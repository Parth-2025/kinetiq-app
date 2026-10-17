"""Explicit, access-scoped longitudinal comparison and coach motion query."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.catalog import skill
from studio.comparison import MAX_SESSIONS, METRICS, compare_sessions, validate_query
from studio.models import TrainingSession

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


def _load(db, user, athlete_id, skill_id, days):
    subject = access.athlete(db, user, athlete_id)
    if not skill(skill_id) or not skill(skill_id)["can_analyze"]:
        raise HTTPException(422, "Choose a supported analyzed skill.")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = db.scalars(access.session_query(user).where(
        TrainingSession.athlete_id == subject.id, TrainingSession.skill_id == skill_id,
        TrainingSession.status == "ready", TrainingSession.created_at >= cutoff,
    ).order_by(TrainingSession.created_at.desc(), TrainingSession.id.desc()).limit(MAX_SESSIONS)).all()
    return subject, sessions


@router.get("/comparison")
def comparison(athlete_id: uuid.UUID, skill_id: str = "basketball.free-throw",
               metric: str = "elbow_flexion", days: int = Query(30),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        validate_query(skill_id, metric, days)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    subject, sessions = _load(db, user, athlete_id, skill_id, days)
    result = compare_sessions(sessions, metric)
    result.update({"athlete_id": str(subject.id), "athlete_name": subject.name,
                   "skill_id": skill_id, "window_days": days,
                   "bounded_to_sessions": MAX_SESSIONS})
    return result


@router.get("/motion-query")
def coach_motion_query(athlete_id: uuid.UUID, skill_id: str = "basketball.free-throw",
                       metric: str = "elbow_flexion", days: int = Query(30),
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Structured query over saved numeric samples; parameters are deliberately allowlisted."""
    if metric not in METRICS or days not in {7, 30, 90}:
        raise HTTPException(422, "Choose an available metric and a 7, 30, or 90 day window.")
    if access.account(db, user).role != "coach":
        raise HTTPException(403, "Coach access required.")
    try:
        validate_query(skill_id, metric, days)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    subject, sessions = _load(db, user, athlete_id, skill_id, days)
    compatibility = compare_sessions(sessions, metric)
    return {"athlete_id": str(subject.id), "athlete_name": subject.name, "skill_id": skill_id,
        "metric": metric, "unit": "deg", "window_days": days, "session_count": len(sessions),
        "bounded_to_sessions": MAX_SESSIONS,
        "comparable": compatibility["comparable"], "reason": compatibility["reason"],
        "scope": "per-session whole-clip frame distributions; samples are not pooled",
        "sessions": compatibility["sessions"]}
