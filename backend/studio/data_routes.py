"""Authenticated export of data the current account is entitled to access."""
import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import AnalysisSession, User, UserSport
from db.session import get_db
from studio import access
from studio.coaching_models import AssignmentCompletion
from studio.rig_models import DisplayRigRevision
from studio.models import (
    Assignment, Athlete, Feedback, Measurement, Membership, Practice,
    PracticeEvent, SessionShare, Team, TrainingSession,
    ShotReview,
)

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


def _record(item, exclude=()):
    return {
        column.name: getattr(item, column.name)
        for column in item.__table__.columns
        if column.name not in exclude
    }


@router.get("/data-export")
def export_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Return the caller's profile, personal results, and owned-team workspace data.

    Shared team sessions are included only where sharing is currently active. The
    export never includes a teammate's private session analysis.
    """
    own_athlete_ids = select(Athlete.id).where(Athlete.account_id == user.id)
    owned_teams = select(Team.id).where(Team.owner_id == user.id, Team.archived.is_(False))
    owned_athletes = access.athlete_query(user).with_only_columns(Athlete.id)
    managed_ids = access.athlete_query(user).with_only_columns(Athlete.id).where(
        or_(Athlete.account_id == user.id, and_(Athlete.creator_id == user.id, Athlete.account_id.is_(None)))
    )
    own_sessions = access.session_query(user).where(
        or_(TrainingSession.owner_id == user.id, TrainingSession.athlete_id.in_(own_athlete_ids))
    )
    shared_sessions = access.session_query(user).where(
        TrainingSession.owner_id != user.id,
        TrainingSession.athlete_id.not_in(own_athlete_ids),
    )
    # Profile tables are account scoped. AnalysisSession is the legacy analysis
    # store and is always filtered directly by user_id.
    athlete_rows = db.scalars(select(Athlete).where(Athlete.account_id == user.id)).all()
    measurements = db.scalars(
        select(Measurement).where(Measurement.athlete_id.in_(managed_ids))
        .order_by(Measurement.created_at)
    ).all()
    personal_sessions = db.scalars(own_sessions.order_by(TrainingSession.created_at)).all()
    shared = db.scalars(shared_sessions.order_by(TrainingSession.created_at)).all()
    session_ids = [s.id for s in personal_sessions + shared]
    feedback = db.scalars(
        select(Feedback).where(
            Feedback.session_id.in_(session_ids),
            or_(Feedback.coach_id == user.id, Feedback.published.is_(True)),
        ).order_by(Feedback.created_at)
    ).all() if session_ids else []
    shot_reviews = db.scalars(
        select(ShotReview).where(ShotReview.session_id.in_(session_ids))
        .order_by(ShotReview.created_at, ShotReview.id)
    ).all() if session_ids else []

    teams = db.scalars(select(Team).where(Team.id.in_(owned_teams)).order_by(Team.created_at)).all()
    athletes = db.scalars(select(Athlete).where(Athlete.id.in_(owned_athletes)).order_by(Athlete.created_at)).all()
    memberships = db.scalars(
        select(Membership).where(Membership.team_id.in_(owned_teams), Membership.active.is_(True)).order_by(Membership.created_at)
    ).all()
    assignments = db.scalars(select(Assignment).where(Assignment.owner_id == user.id, or_(Assignment.team_id.is_(None), Assignment.team_id.in_(owned_teams))).order_by(Assignment.created_at)).all()
    practices = db.scalars(select(Practice).where(Practice.owner_id == user.id, Practice.team_id.in_(owned_teams)).order_by(Practice.created_at)).all()
    practice_ids = [p.id for p in practices]
    events = db.scalars(
        select(PracticeEvent).where(PracticeEvent.practice_id.in_(practice_ids)).order_by(PracticeEvent.created_at)
    ).all() if practice_ids else []

    return {
        "schema_version": 1,
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "account": {
            "profile": _record(user, ("auth0_sub",)),
            "sports": [_record(x) for x in db.scalars(select(UserSport).where(UserSport.user_id == user.id))],
            "studio": _record(access.account(db, user)),
        },
        "personal": {
            "athletes": [_record(a) for a in athlete_rows],
            "measurements": [_record(m) for m in measurements],
            "studio_sessions": [_record(s, ("source",)) | {"source": {k: v for k, v in (s.source or {}).items() if k != "storage_path"}} for s in personal_sessions],
            "analysis_sessions": [_record(s, ("source",)) | {"source": {k: v for k, v in (s.source or {}).items() if k != "storage_path"}} for s in db.scalars(
                select(AnalysisSession).where(AnalysisSession.user_id == user.id).order_by(AnalysisSession.created_at)
            )],
        },
        "owned_teams": {
            "teams": [_record(t) for t in teams],
            "athletes": [_record(a) for a in athletes],
            "memberships": [_record(m) for m in memberships],
            "assignments": [_record(a) for a in assignments],
            "practices": [_record(p) for p in practices],
            "practice_events": [_record(e) for e in events],
        },
        "shared_sessions": [
            _record(s, ("source",)) | {"source": {k: v for k, v in (s.source or {}).items() if k != "storage_path"}}
            for s in shared
        ],
        "visible_feedback": [_record(f) for f in feedback],
        "shot_reviews": [_record(r) for r in shot_reviews],
        "display_rig_revisions": [_record(r) for r in db.scalars(
            select(DisplayRigRevision).where(DisplayRigRevision.session_id.in_(session_ids))
            .order_by(DisplayRigRevision.created_at, DisplayRigRevision.id)
        ).all()] if session_ids else [],
        "assignment_completions": [_record(x) for x in db.scalars(
            select(AssignmentCompletion).where(or_(
                AssignmentCompletion.athlete_id.in_(own_athlete_ids),
                AssignmentCompletion.assignment_id.in_([a.id for a in assignments]),
            ))
        ).all()],
        "session_shares": [_record(x) for x in db.scalars(
            select(SessionShare).where(SessionShare.session_id.in_(session_ids), or_(SessionShare.session_id.in_([s.id for s in personal_sessions]), SessionShare.team_id.in_(owned_teams)))
        ).all()] if session_ids else [],
    }
