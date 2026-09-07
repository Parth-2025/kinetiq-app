from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import AnalysisSession, User
from db.session import get_db

router = APIRouter()

VIDEO_EXP_REWARD = 50
BASE_LEVEL_EXP = 50


def get_total_exp_required_for_level(level: int) -> int:
    if level <= 0:
        return 0
    return BASE_LEVEL_EXP * level * (level + 1) // 2


def calculate_level_progress(exp: int) -> dict:
    level = 0
    while exp >= get_total_exp_required_for_level(level + 1):
        level += 1
    current = get_total_exp_required_for_level(level)
    nxt = get_total_exp_required_for_level(level + 1)
    into = max(0, exp - current)
    span = max(1, nxt - current)
    return {
        "level": level,
        "progressPct": min(100, round((into / span) * 100)),
        "currentLevelExp": current,
        "nextLevelExp": nxt,
    }


@router.get("/me/stats")
def get_stats(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    sport: str | None = None,
) -> dict:
    q = select(
        func.count(AnalysisSession.id),
        func.coalesce(func.sum(AnalysisSession.overall_score), 0),
        func.coalesce(func.avg(AnalysisSession.overall_score), 0),
        func.coalesce(func.max(AnalysisSession.overall_score), 0),
    ).where(AnalysisSession.user_id == user.id)
    if sport:
        q = q.where(AnalysisSession.sport == sport)
    count, total, avg, best = db.execute(q).one()

    latest_q = select(AnalysisSession.overall_score).where(
        AnalysisSession.user_id == user.id
    )
    if sport:
        latest_q = latest_q.where(AnalysisSession.sport == sport)
    latest = db.execute(
        latest_q.order_by(
            AnalysisSession.created_at.desc(), AnalysisSession.id.desc()
        ).limit(1)
    ).scalar()

    videos = int(count)
    exp = videos * VIDEO_EXP_REWARD
    progress = calculate_level_progress(exp)
    return {
        "videosUploaded": videos,
        "shotsAnalyzed": videos,
        "totalScore": round(float(total)),
        "avgScore": round(float(avg), 1) if count else 0,
        "bestScore": round(float(best)) if count else 0,
        "latestScore": round(float(latest)) if latest is not None else 0,
        "exp": exp,
        **progress,
    }
