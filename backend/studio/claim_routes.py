"""Explicit, coach-managed athlete profile claim workflow."""
import datetime as dt
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio.access import account, audit, coach
from studio.claim_models import AthleteClaim
from studio.models import Athlete, Membership, Team, TrainingSession

router = APIRouter(prefix="/studio", tags=["Performance Studio"])
CLAIM_LIFETIME = dt.timedelta(minutes=20)


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


class ClaimCodeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=8, max_length=80)


def _load_claim(db: Session, code: str, lock: bool = False) -> AthleteClaim:
    query = select(AthleteClaim).where(AthleteClaim.token_hash == _hash(code))
    if lock:
        query = query.with_for_update()
    item = db.scalar(query)
    now = dt.datetime.now(dt.timezone.utc)
    if item is None or item.revoked or item.consumed_at is not None or item.expires_at <= now:
        raise HTTPException(404, "This profile claim code is invalid, expired, or already used.")
    return item


def _preview(db: Session, claim: AthleteClaim, user: User) -> dict:
    athlete = db.get(Athlete, claim.athlete_id)
    coach_user = db.get(User, claim.coach_id)
    if athlete is None or coach_user is None or athlete.archived or athlete.account_id is not None:
        raise HTTPException(409, "This managed profile is no longer available to claim.")
    memberships = db.scalars(select(Membership).where(Membership.athlete_id == athlete.id, Membership.active.is_(True))).all()
    teams = [db.get(Team, member.team_id) for member in memberships]
    teams = [team for team in teams if team is not None and not team.archived]
    session_count = db.scalar(select(func.count(TrainingSession.id)).where(
        TrainingSession.athlete_id == athlete.id, TrainingSession.status != "deleted")) or 0
    canonical_exists = db.scalar(select(Athlete.id).where(Athlete.account_id == user.id).limit(1)) is not None
    return {
        "athlete": {"id": str(athlete.id), "name": athlete.name, "sport": athlete.sport, "dominant_side": athlete.dominant_side},
        "coach": {"id": str(coach_user.id), "name": coach_user.name or coach_user.username or "Your coach"},
        "teams": [{"id": str(team.id), "name": team.name, "coach_id": str(team.owner_id)} for team in teams],
        "sharing_notice": "Accepting links this profile to your account and gives you access to this profile's training history, including recordings owned by its coach. Active team memberships remain in place, so the listed coaches and teams may continue to see information shared with them.",
        "session_count": int(session_count),
        "claim_blocked": canonical_exists,
        "claim_block_reason": "Your account already has an athlete profile. Claiming would require a deliberate profile merge, which is not available. Your profile and history will remain unchanged." if canonical_exists else None,
        "expires_at": claim.expires_at.isoformat(),
    }


@router.post("/athletes/{athlete_id}/claim-code", status_code=201)
def issue_claim_code(athlete_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    coach(db, user)
    # Lock creator-owned profile before replacing any outstanding codes.
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id).with_for_update())
    if athlete is None or athlete.archived:
        raise HTTPException(404, "Athlete not found.")
    if athlete.creator_id != user.id:
        raise HTTPException(403, "Only the coach who created this profile can issue a claim code.")
    if athlete.account_id is not None:
        raise HTTPException(409, "This athlete profile is already linked to an account.")
    now = dt.datetime.now(dt.timezone.utc)
    db.execute(update(AthleteClaim).where(AthleteClaim.athlete_id == athlete.id,
        AthleteClaim.revoked.is_(False), AthleteClaim.consumed_at.is_(None)).values(revoked=True))
    code = secrets.token_urlsafe(12).replace("-", "A").replace("_", "B").upper()
    expires = now + CLAIM_LIFETIME
    db.add(AthleteClaim(athlete_id=athlete.id, coach_id=user.id, token_hash=_hash(code), expires_at=expires))
    audit(db, user, "athlete.claim_code_issued", athlete.id, {"expires_at": expires.isoformat()})
    db.flush()
    return {"code": code, "expires_at": expires.isoformat()}


@router.post("/claims/preview")
def preview_claim(body: ClaimCodeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    account_row = account(db, user)
    if account_row.role != "athlete":
        raise HTTPException(403, "Switch to your athlete workspace to claim a profile.")
    claim = _load_claim(db, body.code)
    return _preview(db, claim, user)


@router.delete("/athletes/{athlete_id}/claim-code")
def revoke_claim_code(athlete_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    coach(db, user)
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id).with_for_update())
    if athlete is None or athlete.creator_id != user.id:
        raise HTTPException(404, "Athlete not found.")
    now = dt.datetime.now(dt.timezone.utc)
    changed = db.execute(update(AthleteClaim).where(AthleteClaim.athlete_id == athlete.id,
        AthleteClaim.revoked.is_(False), AthleteClaim.consumed_at.is_(None)).values(revoked=True)).rowcount
    audit(db, user, "athlete.claim_code_revoked", athlete.id, {"revoked_count": int(changed or 0)})
    return {"revoked": int(changed or 0)}


@router.post("/claims/accept")
def accept_claim(body: ClaimCodeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Stable lock order: user, managed profile, then claim row. Serializes first-time
    # profile creation and claim races for this account.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).first()
    claim = _load_claim(db, body.code)
    athlete = db.scalar(select(Athlete).where(Athlete.id == claim.athlete_id).with_for_update())
    claim = _load_claim(db, body.code, lock=True)
    acct = account(db, user)
    if acct.role != "athlete":
        raise HTTPException(403, "Switch to your athlete workspace to claim a profile.")
    canonical = db.scalar(select(Athlete).where(Athlete.account_id == user.id).with_for_update())
    if canonical is not None:
        raise HTTPException(409, "Your account already has an athlete profile. Profile merging is not available; no profile or history was changed.")
    if athlete is None or athlete.creator_id != claim.coach_id or athlete.account_id is not None or athlete.archived:
        raise HTTPException(409, "This managed profile is no longer available to claim.")
    claim.consumed_at = dt.datetime.now(dt.timezone.utc)
    claim.revoked = True
    athlete.account_id = user.id
    db.execute(update(AthleteClaim).where(AthleteClaim.athlete_id == athlete.id,
        AthleteClaim.id != claim.id, AthleteClaim.revoked.is_(False),
        AthleteClaim.consumed_at.is_(None)).values(revoked=True))
    audit(db, user, "athlete.claim_code_revoked", athlete.id, {"claim_id": str(claim.id), "reason": "profile_claimed"})
    audit(db, user, "athlete.profile_claimed", athlete.id, {"coach_id": str(claim.coach_id), "claim_id": str(claim.id)})
    db.flush()
    return {"athlete_id": str(athlete.id), "claimed": True}
