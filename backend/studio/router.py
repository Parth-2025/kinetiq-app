import datetime as dt
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access as access
from studio.catalog import SKILLS, skill
from studio.models import (Assignment, Athlete, AuditEvent, Device, Feedback, Invitation,
    Measurement, Membership, Practice, PracticeEvent, SessionShare, ShotReview, StudioAccount, Team, TrainingSession)
from studio.schemas import (AccountInput, AssignmentInput, AthleteInput, DeviceInput, EventInput,
    FeedbackInput, JoinInput, MeasurementsInput, MemberInput, PracticeInput, SessionInput, ShareInput, TeamInput)
from settings import settings

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


def record(item, exclude=()):
    return {column.name: getattr(item, column.name) for column in item.__table__.columns if column.name not in exclude}


def account_view(item):
    return {"role": item.role, "is_admin": item.is_admin, "onboarding_complete": item.onboarding_complete}


def athlete_view(db, item):
    latest = db.scalar(select(Measurement).where(Measurement.athlete_id == item.id).order_by(Measurement.created_at.desc(), Measurement.id.desc()).limit(1))
    return {**record(item), "measurements": record(latest) if latest else None}


def session_view(db, item, full=False):
    subject = db.get(Athlete, item.athlete_id)
    result = {**record(item, ("source", "analysis", "metrics")), "athlete_name": subject.name if subject else "Athlete",
        "skill_name": (skill(item.skill_id) or {}).get("name", item.skill_id),
        "source": {key: value for key, value in item.source.items() if key not in ("storage_path",)},
        "summary": item.metrics, "analysis_version": item.source.get("analysis_version")}
    if full:
        result["analysis"] = item.analysis
        result["shared_team_ids"] = list(db.scalars(select(SessionShare.team_id).where(SessionShare.session_id == item.id)))
    return result


def teams_query(user):
    membership_ids = select(Membership.team_id).join(Athlete).where(Athlete.account_id == user.id, Membership.active.is_(True))
    return select(Team).where(Team.archived.is_(False), or_(Team.owner_id == user.id, Team.id.in_(membership_ids)))


def assignments_query(user):
    own = select(Athlete.id).where(Athlete.account_id == user.id)
    teams = select(Membership.team_id).where(Membership.athlete_id.in_(own), Membership.active.is_(True))
    return select(Assignment).where(or_(Assignment.owner_id == user.id,
        and_(Assignment.published.is_(True), or_(Assignment.athlete_id.in_(own), Assignment.team_id.in_(teams)))))


def get_practice(db, user, practice_id):
    access.coach(db, user)
    item = db.get(Practice, practice_id)
    if item is None or item.owner_id != user.id:
        raise HTTPException(404, "Practice not found.")
    return item


@router.get("/account")
def get_account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return account_view(access.account(db, user))


@router.patch("/account")
def update_account(body: AccountInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.account(db, user)
    item.role = body.role
    if body.onboarding_complete is not None:
        item.onboarding_complete = body.onboarding_complete
    if body.role == "athlete":
        access.self_athlete(db, user)
    access.audit(db, user, "account.workspace_changed", user.id, {"role": body.role})
    db.flush()
    return account_view(item)


@router.get("/skills")
def skills():
    return SKILLS


@router.get("/overview")
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    acct = access.account(db, user)
    athletes = db.scalars(access.athlete_query(user).order_by(Athlete.name)).all()
    sessions = db.scalars(access.session_query(user).order_by(TrainingSession.created_at.desc()).limit(100)).all()
    feedback = db.scalars(select(Feedback).where(Feedback.session_id.in_([s.id for s in sessions]),
        or_(Feedback.coach_id == user.id, Feedback.published.is_(True))).order_by(Feedback.created_at.desc()).limit(20)).all()
    return {"account": account_view(acct), "name": user.name or user.username or "Athlete",
        "athletes": [athlete_view(db, a) for a in athletes],
        "teams": [record(t) for t in db.scalars(teams_query(user).order_by(Team.name))],
        "sessions": [session_view(db, s) for s in sessions],
        "assignments": [record(a) for a in db.scalars(assignments_query(user).order_by(Assignment.created_at.desc()).limit(100))],
        "feedback": [record(f) for f in feedback],
        "practices": [record(p) for p in db.scalars(select(Practice).where(Practice.owner_id == user.id).order_by(Practice.created_at.desc()).limit(30))] if acct.role == "coach" else []}


@router.get("/athletes/me")
def me_athlete(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return athlete_view(db, access.self_athlete(db, user))


@router.get("/athletes")
def athletes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [athlete_view(db, a) for a in db.scalars(access.athlete_query(user).order_by(Athlete.name))]


@router.post("/athletes", status_code=201)
def add_athlete(body: AthleteInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    if body.team_id:
        access.owned_team(db, user, body.team_id)
    item = Athlete(creator_id=user.id, name=body.name, sport=body.sport, dominant_side=body.dominant_side)
    db.add(item)
    db.flush()
    if body.team_id:
        db.add(Membership(team_id=body.team_id, athlete_id=item.id))
    access.audit(db, user, "athlete.created", item.id)
    return athlete_view(db, item)


@router.get("/athletes/{athlete_id}")
def get_athlete(athlete_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.athlete(db, user, athlete_id)
    return {**athlete_view(db, item), "sessions": [session_view(db, s) for s in db.scalars(
        access.session_query(user).where(TrainingSession.athlete_id == item.id).order_by(TrainingSession.created_at.desc()).limit(100))],
        "measurement_history": [record(m) for m in db.scalars(select(Measurement).where(Measurement.athlete_id == item.id).order_by(Measurement.created_at.desc()).limit(30))]}


@router.patch("/athletes/{athlete_id}")
def edit_athlete(athlete_id: uuid.UUID, body: AthleteInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.athlete(db, user, athlete_id, write=True)
    item.name, item.sport, item.dominant_side = body.name, body.sport, body.dominant_side
    db.flush()
    return athlete_view(db, item)


@router.post("/athletes/{athlete_id}/measurements", status_code=201)
def measurements(athlete_id: uuid.UUID, body: MeasurementsInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.athlete(db, user, athlete_id, write=True)
    measurement = Measurement(athlete_id=item.id, actor_id=user.id, values=body.model_dump())
    db.add(measurement)
    db.flush()
    access.audit(db, user, "measurement.created", measurement.id)
    return record(measurement)


@router.get("/teams")
def teams(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [record(t) for t in db.scalars(teams_query(user).order_by(Team.name))]


@router.post("/teams", status_code=201)
def add_team(body: TeamInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    item = Team(owner_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    access.audit(db, user, "team.created", item.id)
    return record(item)


@router.get("/teams/{team_id}")
def get_team(team_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.scalar(teams_query(user).where(Team.id == team_id))
    if item is None:
        raise HTTPException(404, "Team not found.")
    members = db.scalars(select(Athlete).join(Membership).where(Membership.team_id == team_id, Membership.active.is_(True))).all()
    owner = item.owner_id == user.id
    return {**record(item), "can_manage": owner,
        "members": [athlete_view(db, a) if owner else {"id": a.id, "name": a.name} for a in members],
        "assignments": [record(a) for a in db.scalars(assignments_query(user).where(Assignment.team_id == team_id))]}


@router.patch("/teams/{team_id}")
def edit_team(team_id: uuid.UUID, body: TeamInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.owned_team(db, user, team_id)
    for key, value in body.model_dump().items():
        setattr(item, key, value)
    db.flush()
    return record(item)


@router.post("/teams/{team_id}/members")
def add_member(team_id: uuid.UUID, body: MemberInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.owned_team(db, user, team_id)
    subject = access.manageable_unclaimed_athlete(db, user, body.athlete_id)
    member = db.scalar(select(Membership).where(Membership.team_id == team_id, Membership.athlete_id == subject.id))
    if member:
        member.active = True
    else:
        db.add(Membership(team_id=team_id, athlete_id=subject.id))
    return {"ok": True}


@router.delete("/teams/{team_id}/members/{athlete_id}")
def remove_member(team_id: uuid.UUID, athlete_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    subject = db.get(Athlete, athlete_id)
    if not team or not subject or (team.owner_id != user.id and subject.account_id != user.id):
        raise HTTPException(404, "Membership not found.")
    member = db.scalar(select(Membership).where(Membership.team_id == team_id, Membership.athlete_id == athlete_id).with_for_update())
    if member:
        member.active = False
        # A later rejoin must not reactivate past grants automatically.
        session_ids = select(TrainingSession.id).where(TrainingSession.athlete_id == athlete_id)
        db.execute(delete(SessionShare).where(SessionShare.team_id == team_id, SessionShare.session_id.in_(session_ids)))
        access.audit(db, user, "membership.ended", member.id)
    return {"ok": True}


@router.post("/teams/{team_id}/invitations", status_code=201)
def invite(team_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.owned_team(db, user, team_id)
    code = secrets.token_urlsafe(18)
    item = Invitation(team_id=team_id, token_hash=hashlib.sha256(code.encode()).hexdigest(), expires_at=dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7))
    db.add(item)
    db.flush()
    access.audit(db, user, "invitation.created", item.id)
    return {"id": item.id, "code": code, "expires_at": item.expires_at}


@router.delete("/teams/{team_id}/invitations/{invitation_id}")
def revoke(team_id: uuid.UUID, invitation_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.owned_team(db, user, team_id)
    item = db.get(Invitation, invitation_id)
    if not item or item.team_id != team_id:
        raise HTTPException(404, "Invitation not found.")
    item.revoked = True
    return {"ok": True}


def invitation(db, code):
    item = db.scalar(select(Invitation).where(Invitation.token_hash == hashlib.sha256(code.encode()).hexdigest(), Invitation.revoked.is_(False), Invitation.expires_at > dt.datetime.now(dt.timezone.utc)).with_for_update())
    if not item:
        raise HTTPException(404, "This invitation is invalid or expired. Ask your coach for a new code.")
    team = db.get(Team, item.team_id)
    if not team or team.archived:
        raise HTTPException(404, "Team is unavailable.")
    return item, team


@router.post("/invitations/preview")
def preview_invite(body: JoinInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, team = invitation(db, body.code)
    coach_user = db.get(User, team.owner_id)
    return {"team_id": team.id, "name": team.name, "sport": team.sport, "coach_name": coach_user.name or "Coach", "expires_at": item.expires_at,
        "sharing": "Your coach can see your profile and measurements. Personal sessions stay private until you share them or submit a team assignment."}


@router.post("/invitations/accept")
def accept_invite(body: JoinInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, team = invitation(db, body.code)
    subject = access.self_athlete(db, user)
    item = db.scalar(select(Membership).where(Membership.team_id == team.id, Membership.athlete_id == subject.id))
    if item:
        item.active = True
    else:
        db.add(Membership(team_id=team.id, athlete_id=subject.id))
    access.audit(db, user, "membership.accepted", team.id)
    return record(team)


@router.get("/assignments")
def assignments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [record(a) for a in db.scalars(assignments_query(user).order_by(Assignment.created_at.desc()).limit(200))]


def validate_assignment(db, user, body):
    access.coach(db, user)
    if not skill(body.skill_id):
        raise HTTPException(400, "Unknown skill.")
    if body.team_id:
        access.owned_team(db, user, body.team_id)
    if body.athlete_id:
        subject = access.manageable_unclaimed_athlete(db, user, body.athlete_id)


@router.post("/assignments", status_code=201)
def add_assignment(body: AssignmentInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_assignment(db, user, body)
    item = Assignment(owner_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    access.audit(db, user, "assignment.created", item.id)
    return record(item)


@router.get("/assignments/{assignment_id}")
def get_assignment(assignment_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.scalar(assignments_query(user).where(Assignment.id == assignment_id))
    if item is None:
        raise HTTPException(404, "Assignment not found.")
    return {**record(item), "can_manage": item.owner_id == user.id,
        "sessions": [session_view(db, s) for s in db.scalars(access.session_query(user).where(TrainingSession.assignment_id == item.id))]}


@router.patch("/assignments/{assignment_id}")
def edit_assignment(assignment_id: uuid.UUID, body: AssignmentInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_assignment(db, user, body)
    item = db.get(Assignment, assignment_id)
    if not item or item.owner_id != user.id:
        raise HTTPException(404, "Assignment not found.")
    for key, value in body.model_dump().items():
        setattr(item, key, value)
    db.flush()
    return record(item)


@router.get("/practices")
def practices(user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    return [record(p) for p in db.scalars(select(Practice).where(Practice.owner_id == user.id).order_by(Practice.created_at.desc()).limit(200))]


def validate_practice(db, user, body):
    access.owned_team(db, user, body.team_id)
    seen = set()
    for entry in body.roster:
        access.athlete(db, user, entry.athlete_id)
        if not db.scalar(select(Membership.id).where(Membership.team_id == body.team_id, Membership.athlete_id == entry.athlete_id, Membership.active.is_(True))):
            raise HTTPException(400, "Choose athletes on this team's active roster.")
        if entry.athlete_id in seen:
            raise HTTPException(400, "An athlete can only appear once in the practice roster.")
        seen.add(entry.athlete_id)


@router.post("/practices", status_code=201)
def add_practice(body: PracticeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_practice(db, user, body)
    data = body.model_dump(exclude={"roster"})
    item = Practice(owner_id=user.id, **data, roster=[r.model_dump(mode="json") for r in body.roster])
    db.add(item)
    db.flush()
    return record(item)


@router.patch("/practices/{practice_id}")
def edit_practice(practice_id: uuid.UUID, body: PracticeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = get_practice(db, user, practice_id)
    # Serialize roster changes with event creation on the same practice.
    db.refresh(item, with_for_update=True)
    validate_practice(db, user, body)
    proposed = {entry.athlete_id for entry in body.roster}
    removed = {uuid.UUID(entry["athlete_id"]) for entry in item.roster} - proposed
    if removed and db.scalar(select(PracticeEvent.id).where(
        PracticeEvent.practice_id == item.id,
        PracticeEvent.athlete_id.in_(removed),
    ).limit(1)):
        raise HTTPException(409, "An athlete with recorded events must remain on the practice roster.")
    for key, value in body.model_dump(exclude={"roster"}).items():
        setattr(item, key, value)
    item.roster = [r.model_dump(mode="json") for r in body.roster]
    db.flush()
    return record(item)


@router.get("/practices/{practice_id}")
def practice_detail(practice_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = get_practice(db, user, practice_id)
    events = db.scalars(select(PracticeEvent).where(PracticeEvent.practice_id == item.id).order_by(PracticeEvent.created_at)).all()
    shots = [e for e in events if e.data.get("kind") == "shot"]
    known = [e for e in shots if e.data.get("outcome") in ("made", "missed")]
    return {**record(item), "events": [record(e) for e in events], "report": {
        "provenance": "Coach-entered events. Automatic player tracking is not connected.",
        "recorded_shots": len(shots), "known_outcomes": len(known),
        "makes": sum(e.data.get("outcome") == "made" for e in known),
        "make_percentage": round(100 * sum(e.data.get("outcome") == "made" for e in known) / len(known), 1) if known else None,
        "tracking_status": "unavailable"}}


@router.post("/practices/{practice_id}/events", status_code=201)
def add_event(practice_id: uuid.UUID, body: EventInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    practice = get_practice(db, user, practice_id)
    db.refresh(practice, with_for_update=True)
    if body.athlete_id and str(body.athlete_id) not in [r["athlete_id"] for r in practice.roster]:
        raise HTTPException(400, "Choose an athlete on this practice roster.")
    item = PracticeEvent(practice_id=practice.id, athlete_id=body.athlete_id, actor_id=user.id,
        data={**body.model_dump(mode="json", exclude={"athlete_id"}), "provenance": "coach_entered"})
    db.add(item)
    db.flush()
    access.audit(db, user, "practice.event_created", item.id)
    return record(item)


@router.delete("/practices/{practice_id}/events/{event_id}")
def remove_event(practice_id: uuid.UUID, event_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_practice(db, user, practice_id)
    item = db.get(PracticeEvent, event_id)
    if not item or item.practice_id != practice_id:
        raise HTTPException(404, "Event not found.")
    access.audit(db, user, "practice.event_removed", item.id, item.data)
    db.delete(item)
    return {"ok": True}


@router.get("/sessions")
def sessions(user: User = Depends(current_user), db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=200)):
    return [session_view(db, s) for s in db.scalars(access.session_query(user).order_by(TrainingSession.created_at.desc()).limit(limit))]


@router.post("/sessions", status_code=201)
def create_session(body: SessionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    definition = skill(body.skill_id)
    if not definition or not definition["can_analyze"]:
        raise HTTPException(409, "Analysis is not available for this skill yet.")
    subject = access.athlete(db, user, body.athlete_id) if body.athlete_id else access.self_athlete(db, user)
    if subject.account_id != user.id:
        access.coach(db, user)
        if subject.account_id is None:
            subject = access.manageable_unclaimed_athlete(db, user, subject.id)
    assignment = None
    if body.assignment_id:
        assignment = db.scalar(assignments_query(user).where(Assignment.id == body.assignment_id))
        eligible = assignment and assignment.published and assignment.skill_id == body.skill_id
        if eligible and assignment.athlete_id:
            eligible = assignment.athlete_id == subject.id
        if eligible and assignment.team_id:
            eligible = db.scalar(select(Membership.id).where(Membership.team_id == assignment.team_id, Membership.athlete_id == subject.id, Membership.active.is_(True)).with_for_update()) is not None
        if not eligible:
            raise HTTPException(400, "This assignment is not available for the selected athlete and skill.")
    if subject.dominant_side not in ("left", "right"):
        raise HTTPException(400, "Set the athlete's shooting side to left or right in their profile before recording.")
    latest = db.scalar(select(Measurement).where(Measurement.athlete_id == subject.id).order_by(Measurement.created_at.desc()).limit(1))
    item = TrainingSession(owner_id=user.id, athlete_id=subject.id, skill_id=body.skill_id,
        assignment_id=body.assignment_id, measurement_id=latest.id if latest else None,
        source={"capture_mode": "rgb", "schema_version": 1, "dominant_side": subject.dominant_side}, analysis={})
    db.add(item)
    db.flush()
    if assignment and assignment.team_id:
        # Assignment submission is explicit sharing; the UI identifies the recipient.
        db.add(SessionShare(session_id=item.id, team_id=assignment.team_id))
    return session_view(db, item)


@router.get("/sessions/{session_id}")
def get_session(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id)
    notes = db.scalars(select(Feedback).where(Feedback.session_id == item.id,
        or_(Feedback.coach_id == user.id, Feedback.published.is_(True))).order_by(Feedback.created_at.desc())).all()
    eligible_teams = db.scalars(select(Team).join(Membership).where(
        Membership.athlete_id == item.athlete_id, Membership.active.is_(True), Team.archived.is_(False))).all() if item.owner_id == user.id else []
    return {**session_view(db, item, full=True),
        "feedback": [{**record(f), "can_edit": f.coach_id == user.id} for f in notes],
        "shareable_teams": [{"id": t.id, "name": t.name} for t in eligible_teams],
        "can_manage": item.owner_id == user.id}


@router.post("/sessions/{session_id}/video", status_code=202)
async def upload_session_video(session_id: uuid.UUID, video: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id, write=True)
    db.refresh(item, with_for_update=True)
    if item.status not in ("awaiting_upload", "failed"):
        raise HTTPException(409, "This session already has a recording or is being processed.")
    if video.content_type and video.content_type not in ("application/octet-stream",) and not video.content_type.startswith("video/"):
        raise HTTPException(415, "Choose a video file.")
    settings.studio_media_dir.mkdir(parents=True, exist_ok=True)
    path = settings.studio_media_dir / f"{session_id}.video"
    temporary = settings.studio_media_dir / f"{session_id}.{secrets.token_hex(6)}.upload"
    total = 0
    try:
        with temporary.open("wb") as stream:
            while chunk := await video.read(1024 * 1024):
                total += len(chunk)
                if total > settings.studio_upload_limit_mb * 1024 * 1024:
                    raise HTTPException(413, f"Choose a clip smaller than {settings.studio_upload_limit_mb} MB.")
                stream.write(chunk)
        if total == 0:
            raise HTTPException(400, "The recording is empty.")
        temporary.replace(path)
        item.source = {**item.source, "bytes": total, "source_retained": True, "filename": (video.filename or "recording")[:160], "uploaded_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        item.status, item.error = "queued", None
        db.flush()
        return {"id": item.id, "status": item.status}
    finally:
        temporary.unlink(missing_ok=True)
        await video.close()


@router.delete("/sessions/{session_id}")
def delete_session(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from studio.rig_models import DisplayRigRevision
    item = access.session(db, user, session_id, write=True)
    db.refresh(item, with_for_update=True)
    item.status = "deleted"
    item.analysis, item.metrics, item.source, item.error = {}, {}, {}, None
    db.execute(delete(DisplayRigRevision).where(DisplayRigRevision.session_id == item.id))
    db.execute(delete(SessionShare).where(SessionShare.session_id == item.id))
    db.execute(delete(Feedback).where(Feedback.session_id == item.id))
    db.execute(delete(ShotReview).where(ShotReview.session_id == item.id))
    (settings.studio_media_dir / f"{session_id}.video").unlink(missing_ok=True)
    access.audit(db, user, "session.deleted", item.id)
    return {"ok": True}


@router.put("/sessions/{session_id}/sharing")
def share(session_id: uuid.UUID, body: ShareInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id, write=True)
    db.refresh(item, with_for_update=True)
    if item.status == "deleted":
        raise HTTPException(404, "Session not found.")
    eligible = set(db.scalars(select(Membership.team_id).where(Membership.athlete_id == item.athlete_id, Membership.active.is_(True)).with_for_update()))
    if not set(body.team_ids).issubset(eligible):
        raise HTTPException(400, "Sessions can only be shared with the athlete's current teams.")
    db.execute(delete(SessionShare).where(SessionShare.session_id == item.id))
    for team_id in set(body.team_ids):
        db.add(SessionShare(session_id=item.id, team_id=team_id))
    access.audit(db, user, "session.sharing_changed", item.id)
    return {"ok": True}


@router.post("/sessions/{session_id}/feedback", status_code=201)
def add_feedback(session_id: uuid.UUID, body: FeedbackInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    item = access.session(db, user, session_id)
    db.refresh(item, with_for_update=True)
    if item.status == "deleted":
        raise HTTPException(404, "Session not found.")
    note = Feedback(coach_id=user.id, session_id=item.id, **body.model_dump())
    db.add(note)
    db.flush()
    access.audit(db, user, "feedback.published" if body.published else "feedback.drafted", note.id)
    return record(note)


@router.patch("/feedback/{feedback_id}")
def edit_feedback(feedback_id: uuid.UUID, body: FeedbackInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    item = db.get(Feedback, feedback_id)
    if not item or item.coach_id != user.id:
        raise HTTPException(404, "Feedback not found.")
    access.session(db, user, item.session_id)
    item.body, item.published = body.body, body.published
    access.audit(db, user, "feedback.updated", item.id, {"published": body.published})
    db.flush()
    return record(item)


@router.get("/devices")
def devices(user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    return [{**record(d), "connection_status": "not_connected"} for d in db.scalars(select(Device).where(Device.owner_id == user.id).order_by(Device.name))]


@router.post("/devices", status_code=201)
def add_device(body: DeviceInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.coach(db, user)
    if body.athlete_id:
        access.athlete(db, user, body.athlete_id)
    if db.scalar(select(Device.id).where(Device.owner_id == user.id, Device.serial == body.serial)):
        raise HTTPException(409, "This device is already registered in your workspace.")
    item = Device(owner_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    return {**record(item), "connection_status": "not_connected"}


@router.get("/admin/overview")
def admin_overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.admin(db, user)
    return {"accounts": db.scalar(select(func.count()).select_from(StudioAccount)),
        "teams": db.scalar(select(func.count()).select_from(Team)),
        "sessions": db.scalar(select(func.count()).select_from(TrainingSession).where(TrainingSession.status != "deleted")),
        "failed_sessions": db.scalar(select(func.count()).select_from(TrainingSession).where(TrainingSession.status == "failed")),
        "audit": [record(a) for a in db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(100))],
        "skills": SKILLS}
