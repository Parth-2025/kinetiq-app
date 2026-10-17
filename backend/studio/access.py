from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from db.models import User
from studio.models import Athlete, Membership, SessionShare, StudioAccount, Team, TrainingSession, AuditEvent


def account(db: Session, user: User) -> StudioAccount:
    item = db.get(StudioAccount, user.id)
    if item is None:
        # Serialize first-use creation for concurrent requests by the same account.
        db.execute(select(User.id).where(User.id == user.id).with_for_update()).first()
        item = db.get(StudioAccount, user.id, populate_existing=True)
        if item is None:
            item = StudioAccount(user_id=user.id)
            db.add(item)
            db.flush()
    return item


def coach(db: Session, user: User):
    if account(db, user).role != "coach":
        raise HTTPException(403, "Switch to your coach workspace to perform this action.")


def admin(db: Session, user: User):
    if not account(db, user).is_admin:
        raise HTTPException(403, "Administrator access is required.")


def self_athlete(db: Session, user: User) -> Athlete:
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).first()
    item = db.scalar(select(Athlete).where(Athlete.account_id == user.id))
    if item is None:
        item = Athlete(creator_id=user.id, account_id=user.id, name=user.name or user.username or "Athlete")
        db.add(item)
        db.flush()
    return item


def owned_team(db: Session, user: User, team_id) -> Team:
    coach(db, user)
    item = db.get(Team, team_id)
    if item is None or item.owner_id != user.id or item.archived:
        raise HTTPException(404, "Team not found.")
    return item


def athlete_query(user: User):
    roster_ids = select(Membership.athlete_id).join(Team).where(Team.owner_id == user.id, Membership.active.is_(True), Team.archived.is_(False))
    return select(Athlete).where(Athlete.archived.is_(False), or_(Athlete.account_id == user.id,
        and_(Athlete.creator_id == user.id, Athlete.account_id.is_(None)), Athlete.id.in_(roster_ids)))


def athlete(db: Session, user: User, athlete_id, write=False) -> Athlete:
    item = db.scalar(athlete_query(user).where(Athlete.id == athlete_id))
    if item is None:
        raise HTTPException(404, "Athlete not found.")
    if write and item.account_id != user.id and item.creator_id != user.id:
        raise HTTPException(403, "Only the athlete or their creator can change this profile and measurements.")
    return item


def manageable_unclaimed_athlete(db: Session, user: User, athlete_id, account_conflict_status=409) -> Athlete:
    """Resolve a coach-managed athlete for actions that assign work or roster access."""
    item = athlete(db, user, athlete_id)
    if item.account_id is not None:
        raise HTTPException(account_conflict_status, "Account holders must accept a team invitation.")
    if item.creator_id != user.id:
        raise HTTPException(403, "Only the athlete's creator can manage this athlete.")
    return item


def session_query(user: User):
    # Every team share also requires current membership of the subject in that team.
    shared = select(SessionShare.session_id).join(Team, Team.id == SessionShare.team_id).join(
        TrainingSession, TrainingSession.id == SessionShare.session_id).join(Membership,
        and_(Membership.team_id == Team.id, Membership.athlete_id == TrainingSession.athlete_id)
    ).where(Team.owner_id == user.id, Team.archived.is_(False), Membership.active.is_(True))
    own_subjects = select(Athlete.id).where(Athlete.account_id == user.id)
    return select(TrainingSession).where(TrainingSession.status != "deleted", or_(TrainingSession.owner_id == user.id,
        TrainingSession.athlete_id.in_(own_subjects), TrainingSession.id.in_(shared)))


def session(db: Session, user: User, session_id, write=False) -> TrainingSession:
    item = db.scalar(session_query(user).where(TrainingSession.id == session_id))
    if item is None:
        raise HTTPException(404, "Session not found.")
    if write and item.owner_id != user.id:
        raise HTTPException(403, "Only the session owner can change this session.")
    return item


def audit(db: Session, user: User, action: str, resource_id, detail=None):
    db.add(AuditEvent(actor_id=user.id, action=action, resource_id=str(resource_id), detail=detail or {}))
