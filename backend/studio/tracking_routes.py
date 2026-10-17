"""Private owner-scoped job records for experimental anonymous tracking."""
import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio.access import audit, coach
from studio.models import Athlete, Practice
from studio.practice_capture_models import PracticeCameraSource
from studio.practice_tracking_models import PracticeTrackingJob

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


class TrackLinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    athlete_id: uuid.UUID | None = None


def _practice(db, user, practice_id):
    coach(db, user)
    practice = db.get(Practice, practice_id)
    if practice is None or practice.owner_id != user.id:
        raise HTTPException(404, "Practice not found.")
    return practice


def _job(db, user, practice_id, job_id, *, lock=False):
    _practice(db, user, practice_id)
    query = select(PracticeTrackingJob).where(
        PracticeTrackingJob.id == job_id,
        PracticeTrackingJob.practice_id == practice_id,
        PracticeTrackingJob.owner_id == user.id,
    )
    if lock:
        query = query.with_for_update()
    item = db.scalar(query)
    if item is None:
        raise HTTPException(404, "Tracking job not found.")
    return item


def _view(item):
    return {
        "id": str(item.id), "practice_id": str(item.practice_id), "source_id": str(item.source_id),
        "status": item.status, "created_at": item.created_at, "updated_at": item.updated_at,
        "result": item.result, "links": item.links,
        "error": item.error,
        "tracking_status": "unsupported",
        "note": "Video person detection and tracking are not implemented. This private record stores coach-reviewed links only; no tracks or player metrics are generated.",
        "source_retention": "Camera footage remains private and is removed with its camera source. Tracking records are deleted with that source; automatic expiry is not configured.",
    }


@router.post("/practices/{practice_id}/camera-sources/{source_id}/tracking-jobs", status_code=201)
def create_job(practice_id: uuid.UUID, source_id: uuid.UUID,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    practice = _practice(db, user, practice_id)
    source = db.scalar(select(PracticeCameraSource).where(
        PracticeCameraSource.id == source_id,
        PracticeCameraSource.practice_id == practice.id,
        PracticeCameraSource.owner_id == user.id,
    ))
    if source is None:
        raise HTTPException(404, "Camera source not found.")
    if not source.media_path:
        raise HTTPException(409, "Upload private camera footage before creating a tracking record.")
    item = PracticeTrackingJob(practice_id=practice.id, source_id=source.id, owner_id=user.id,
                               status="unsupported", result={"tracking_status": "unsupported", "tracks": []})
    db.add(item)
    db.flush()
    audit(db, user, "practice.tracking_job_created", item.id, {"status": "unsupported"})
    return _view(item)


@router.get("/practices/{practice_id}/tracking-jobs")
def list_jobs(practice_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _practice(db, user, practice_id)
    rows = db.scalars(select(PracticeTrackingJob).where(
        PracticeTrackingJob.practice_id == practice_id,
        PracticeTrackingJob.owner_id == user.id,
    ).order_by(PracticeTrackingJob.created_at.desc()).limit(100)).all()
    return {"jobs": [_view(row) for row in rows]}


@router.get("/practices/{practice_id}/tracking-jobs/{job_id}")
def get_job(practice_id: uuid.UUID, job_id: uuid.UUID,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _view(_job(db, user, practice_id, job_id))


@router.put("/practices/{practice_id}/tracking-jobs/{job_id}/tracks/{track_id}/link")
def link_track(practice_id: uuid.UUID, job_id: uuid.UUID, track_id: str, body: TrackLinkInput,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not track_id or len(track_id) > 80:
        raise HTTPException(422, "Track ID must contain 1 to 80 characters.")
    item = _job(db, user, practice_id, job_id, lock=True)
    practice = db.get(Practice, practice_id)
    roster_ids = {
        str(entry.get("athlete_id"))
        for entry in (practice.roster or [])
        if isinstance(entry, dict) and entry.get("athlete_id")
    }
    track_ids = {
        row.get("track_id")
        for row in (item.result or {}).get("tracks", [])
        if isinstance(row, dict) and isinstance(row.get("track_id"), str)
    }
    if track_id not in track_ids:
        raise HTTPException(404, "Track not found in this job.")
    if body.athlete_id is not None:
        athlete = db.scalar(select(Athlete).where(
            Athlete.id == body.athlete_id,
            Athlete.archived.is_(False),
            Athlete.creator_id == user.id,
        ))
        if str(body.athlete_id) not in roster_ids or athlete is None:
            raise HTTPException(422, "Choose an athlete on this practice roster that you manage.")
    links = dict(item.links or {})
    if body.athlete_id is None:
        links.pop(track_id, None)
    else:
        # Keep one track linked to at most one roster athlete and vice versa.
        links = {key: value for key, value in links.items() if value != str(body.athlete_id)}
        links[track_id] = str(body.athlete_id)
    item.links = links
    db.flush()
    audit(db, user, "practice.tracking_link_reviewed", item.id,
          {"track_id": track_id, "athlete_id": str(body.athlete_id) if body.athlete_id else None})
    return _view(item)
