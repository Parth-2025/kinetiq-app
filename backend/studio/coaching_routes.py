"""Coach and athlete workflow endpoints kept separate from the core Studio router."""
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio.access import account, audit, coach
from studio.catalog import skill
from studio.models import Assignment, Athlete, Membership, Team
from studio.coaching_models import AssignmentCompletion
from studio.router import assignments_query, get_practice

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


class CompletionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool


def completion_assignment(db: Session, user: User, assignment_id: uuid.UUID) -> Assignment:
    assignment = db.scalar(assignments_query(user).where(Assignment.id == assignment_id))
    if assignment is None or not assignment.published:
        raise HTTPException(404, "Assignment not found.")
    definition = skill(assignment.skill_id)
    if definition is None or definition["can_analyze"]:
        raise HTTPException(400, "Completion is available for written assignments.")
    return assignment


def athlete_for_assignment(db: Session, user: User, assignment: Assignment) -> Athlete:
    acct = account(db, user)
    if acct.role != "athlete":
        raise HTTPException(403, "Athlete access required.")
    athlete = db.scalar(select(Athlete).where(Athlete.account_id == user.id, Athlete.archived.is_(False)).with_for_update())
    if athlete is None:
        raise HTTPException(404, "Athlete profile not found.")
    if assignment.team_id and db.scalar(select(Membership.id).join(Team, Team.id == Membership.team_id).where(
        Team.archived.is_(False),
        Membership.team_id == assignment.team_id,
        Membership.athlete_id == athlete.id,
        Membership.active.is_(True),
    ).with_for_update()):
        return athlete
    raise HTTPException(404, "Assignment not found.")


def completion_view(db: Session, assignment: Assignment, athlete: Athlete) -> dict:
    item = db.scalar(select(AssignmentCompletion).where(
        AssignmentCompletion.assignment_id == assignment.id,
        AssignmentCompletion.athlete_id == athlete.id,
    ))
    return {"assignment_id": str(assignment.id), "athlete_id": str(athlete.id),
            "completed": bool(item and item.completed),
            "completed_at": item.completed_at.isoformat() if item and item.completed_at else None}


@router.get("/assignments/{assignment_id}/completion")
def get_completion(assignment_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    assignment = completion_assignment(db, user, assignment_id)
    athlete = athlete_for_assignment(db, user, assignment)
    return completion_view(db, assignment, athlete)


@router.get("/assignments/{assignment_id}/completions")
def list_completions(assignment_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    coach(db, user)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.owner_id != user.id or not assignment.published:
        raise HTTPException(404, "Assignment not found.")
    definition = skill(assignment.skill_id)
    if definition is None or definition["can_analyze"]:
        raise HTTPException(400, "Completion is available for written assignments.")
    if assignment.team_id:
        team = db.get(Team, assignment.team_id)
        if team is None or team.archived or team.owner_id != user.id:
            raise HTTPException(404, "Assignment not found.")
        athletes = db.scalars(select(Athlete).join(Membership, Membership.athlete_id == Athlete.id).where(
            Membership.team_id == assignment.team_id, Membership.active.is_(True),
            Athlete.account_id.is_not(None), Athlete.archived.is_(False),
        ).order_by(Athlete.name)).all()
    elif assignment.athlete_id:
        athletes = db.scalars(select(Athlete).where(Athlete.id == assignment.athlete_id, Athlete.account_id.is_not(None), Athlete.archived.is_(False))).all()
    else:
        athletes = []
    return [{**completion_view(db, assignment, athlete), "athlete_name": athlete.name} for athlete in athletes]


@router.put("/assignments/{assignment_id}/completion")
def set_completion(assignment_id: uuid.UUID, body: CompletionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    assignment = completion_assignment(db, user, assignment_id)
    athlete = athlete_for_assignment(db, user, assignment)
    item = db.scalar(select(AssignmentCompletion).where(
        AssignmentCompletion.assignment_id == assignment.id,
        AssignmentCompletion.athlete_id == athlete.id,
    ).with_for_update())
    changed = item is None or item.completed != body.completed
    if item is None:
        now = dt.datetime.now(dt.timezone.utc)
        item = AssignmentCompletion(assignment_id=assignment.id, athlete_id=athlete.id,
                                    completed=body.completed, completed_at=now if body.completed else None)
        db.add(item)
    else:
        was_completed = item.completed
        item.completed = body.completed
        if not body.completed:
            item.completed_at = None
        elif not was_completed:
            item.completed_at = dt.datetime.now(dt.timezone.utc)
    if changed:
        audit(db, user, "assignment.completion_changed", assignment.id, {"completed": body.completed})
    db.flush()
    return completion_view(db, assignment, athlete)


class PracticeStatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str


@router.patch("/practices/{practice_id}/status")
def set_practice_status(practice_id: uuid.UUID, body: PracticeStatusInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.status not in {"draft", "live", "completed"}:
        raise HTTPException(422, "Status must be draft, live, or completed.")
    item = get_practice(db, user, practice_id)
    previous = item.status
    item.status = body.status
    audit(db, user, "practice.status_changed", item.id, {"from": previous, "to": body.status})
    db.flush()
    return {"id": str(item.id), "status": item.status}
