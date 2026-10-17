"""Owner-reviewed shot candidates and per-attempt pose reports."""
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.models import ShotReview, TrainingSession
from studio.shot_analysis import summarize_shot_candidates
from studio.release_analysis import summarize_releases

router = APIRouter(prefix="/studio", tags=["Performance Studio"])
_MANUAL_ID = re.compile(r"^manual-[A-Za-z0-9][A-Za-z0-9_-]{0,72}$")
_MAX_REVIEWS_PER_SESSION = 1000


class ShotReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str = Field(min_length=1, max_length=80)
    source_analysis_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    decision: str = Field(pattern=r"^(confirmed|rejected)$")
    interval_ms: dict | None = None
    note: str | None = Field(default=None, max_length=2000)


def _digest(analysis: dict) -> str:
    try:
        raw = json.dumps(analysis, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(422, "Stored analysis cannot be hashed for shot review.") from exc
    return hashlib.sha256(raw).hexdigest()


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _duration(analysis: dict) -> float:
    duration = analysis.get("duration_ms")
    if not _finite(duration) or duration <= 0:
        raise HTTPException(422, "Analysis has no valid source duration for shot review.")
    return float(duration)


def _candidate_catalog(analysis: dict, duration: float):
    result = {}
    shot = analysis.get("shot_candidates") if isinstance(analysis.get("shot_candidates"), dict) else {}
    for candidate in shot.get("candidates", []) if isinstance(shot.get("candidates"), list) else []:
        if not isinstance(candidate, dict):
            continue
        index = candidate.get("candidate_index")
        start, end = candidate.get("start_ms"), candidate.get("end_ms")
        if isinstance(index, int) and not isinstance(index, bool) and _finite(start) and _finite(end) and 0 <= start < end <= duration:
            cid = f"pose-{index}"
            result[cid] = {"interval_ms": {"start_ms": float(start), "end_ms": float(end)},
                           "provenance": "pose_motion_candidate", "release": None}
    ball = analysis.get("ball") if isinstance(analysis.get("ball"), dict) else {}
    attempts = ball.get("attempts", []) if isinstance(ball.get("attempts"), list) else []
    for attempt in attempts:
        if not isinstance(attempt, dict) or not isinstance(attempt.get("id"), str):
            continue
        start, end = attempt.get("start_ms"), attempt.get("end_ms")
        if _finite(start) and _finite(end) and 0 <= start < end <= duration:
            release = attempt.get("release") if isinstance(attempt.get("release"), dict) else None
            cid = f"ball-{attempt['id']}"
            result[cid] = {"interval_ms": {"start_ms": float(start), "end_ms": float(end)},
                           "provenance": "ball_supported_candidate", "release": release}
    return result


def _compatible_release(release, interval):
    """Keep observed release provenance only when its full timing range fits."""
    if not isinstance(release, dict):
        return None
    earliest = release.get("earliest_ms", release.get("time_ms"))
    latest = release.get("latest_ms", release.get("time_ms"))
    if (_finite(earliest) and _finite(latest) and earliest <= latest and
            interval["start_ms"] <= earliest <= latest <= interval["end_ms"]):
        return release
    return None


def _latest_reviews(db, session_id):
    rows = db.scalars(select(ShotReview).where(ShotReview.session_id == session_id)
                      .order_by(ShotReview.created_at, ShotReview.id)).all()
    latest = {}
    for row in rows:
        latest[row.candidate_id] = row
    return rows, latest


def _release_for_interval(catalog, interval):
    """Attach only a unique observed release contained by reviewed bounds."""
    matches = [(cid, _compatible_release(candidate.get("release"), interval))
               for cid, candidate in catalog.items()]
    matches = [(cid, release) for cid, release in matches if release is not None]
    if len(matches) != 1:
        return None
    cid, release = matches[0]
    return {**release, "ball_candidate_id": cid}


def _view_review(item):
    return {"id": str(item.id), "author_id": str(item.reviewer_id), "decision": item.decision,
            "interval_ms": item.interval_ms, "release": item.release, "note": item.note,
            "source_analysis_sha256": item.source_analysis_sha256,
            "created_at": item.created_at.isoformat() if item.created_at else None}


def _session_locked(db, user, session_id, *, write=False):
    # Access policy is checked before taking the row lock; locking serializes
    # concurrent edits and guarantees overlap checks observe preceding commits.
    access.session(db, user, session_id, write=write)
    item = db.scalar(select(TrainingSession).where(TrainingSession.id == session_id)
                     .with_for_update().execution_options(populate_existing=True))
    if item is None or item.status == "deleted":
        raise HTTPException(404, "Session not found.")
    if item.status != "ready":
        raise HTTPException(409, "Shot review is available when session analysis is ready.")
    return item


def _report(db, item):
    analysis = item.analysis if isinstance(item.analysis, dict) else {}
    duration = _duration(analysis)
    digest = _digest(analysis)
    catalog = _candidate_catalog(analysis, duration)
    _, latest = _latest_reviews(db, item.id)
    # Only current reviews bound to this exact analysis revision affect reports.
    current = {cid: row for cid, row in latest.items() if row.source_analysis_sha256 == digest}
    attempts = []
    confirmed_intervals = []
    confirmed_ids = []
    for cid in sorted(set(catalog) | {key for key in latest if key.startswith("manual-")}):
        candidate = catalog.get(cid)
        latest_review = latest.get(cid)
        review = current.get(cid)
        if cid.startswith("manual-") and candidate is None and review and review.decision == "confirmed":
            candidate = {"interval_ms": review.interval_ms, "provenance": "manual_review", "release": None}
        confirmed = review is not None and review.decision == "confirmed" and isinstance(review.interval_ms, dict)
        interval = review.interval_ms if confirmed else candidate["interval_ms"] if candidate else None
        body = None
        if confirmed and interval:
            confirmed_ids.append(cid)
            confirmed_intervals.append({"start_ms": interval["start_ms"], "end_ms": interval["end_ms"]})
        release_provenance = _release_for_interval(catalog, interval) if confirmed else None
        attempts.append({"candidate_id": cid,
            "candidate_interval_ms": candidate["interval_ms"] if candidate else None,
            "candidate_provenance": candidate["provenance"] if candidate else "manual_review",
            "latest_review": ({**_view_review(latest_review), "stale": latest_review.source_analysis_sha256 != digest}
                              if latest_review else None),
            "body_report": body,
            "ball_release_provenance": release_provenance if release_provenance else
                {"status": "unavailable", "reason": "A unique ball-supported release window inside the corrected interval is required."}})
    frames = analysis.get("frames", []) if isinstance(analysis.get("frames"), list) else []
    summary = summarize_shot_candidates(frames, confirmed_intervals)
    by_index = {entry["candidate_index"]: entry for entry in summary["candidates"]}
    usable = excluded = 0
    confirmed_index = 0
    for attempt in attempts:
        row = current.get(attempt["candidate_id"])
        if row and row.decision == "confirmed" and row.interval_ms:
            body = by_index.get(confirmed_index)
            confirmed_index += 1
            if body:
                body["shot_status"] = "reviewed_by_owner"
                body["reason"] = "Owner-confirmed interval; body measurements remain pose-derived."
            attempt["body_report"] = body
            if body and any(metric.get("status") == "available" for metric in body["metrics"].values()):
                usable += 1
            else:
                excluded += 1
    # Manual IDs are included in attempts when they have a current confirmed review.
    confirmed_count = sum(1 for row in current.values() if row.decision == "confirmed" and row.interval_ms)
    rejected_count = sum(1 for row in current.values() if row.decision == "rejected")
    pending_count = sum(1 for cid in catalog if cid not in current)
    release_summary = summarize_releases(frames, [
        {"candidate_id": a["candidate_id"], "interval_ms": current[a["candidate_id"]].interval_ms,
         "release": a["ball_release_provenance"]}
        for a in attempts if a["candidate_id"] in confirmed_ids
    ])
    release_by_id = {a["candidate_id"]: a for a in release_summary["attempts"]}
    for attempt in attempts:
        attempt["release_body_report"] = release_by_id.get(attempt["candidate_id"])
    for metric in summary["cross_candidate_consistency"].values():
        metric["candidate_ids_used"] = [confirmed_ids[i] for i in metric["candidate_ids_used"]]
    return {"session_id": str(item.id), "source_analysis_sha256": digest, "duration_ms": duration,
        "attempts": attempts,
        "counts": {"candidate_count": len(set(catalog) | {k for k in latest if k.startswith("manual-")}),
                   "confirmed_count": confirmed_count, "rejected_count": rejected_count,
                   "pending_count": pending_count, "usable_body_attempts": usable,
                   "excluded_body_attempts": excluded},
        "consistency": summary["cross_candidate_consistency"],
        "release_consistency": release_summary["consistency"],
        "unavailable_measurements": {
            "release_speed": {"value": None, "unit": "m/s", "status": "unavailable", "reason": "Physical speed requires calibrated spatial scale and camera geometry."},
            "arc": {"value": None, "unit": "deg", "status": "unavailable", "reason": "Image positions do not establish a calibrated 3D launch angle."},
            "spin": {"value": None, "unit": "rev/s", "status": "unavailable", "reason": "Ball surface rotation is not observed by this detector."},
            "physical_ball_metrics": {"value": None, "unit": None, "status": "unavailable",
                                      "reason": "Image-space ball paths may be available; calibrated 3D ball motion is not measured."}}}


@router.get("/sessions/{session_id}/shots")
def get_shots(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id)
    if item.status == "deleted":
        raise HTTPException(404, "Session not found.")
    if item.status != "ready":
        raise HTTPException(409, "Shot report is available when session analysis is ready.")
    return _report(db, item)


@router.post("/sessions/{session_id}/shot-reviews", status_code=201)
def review_shot(session_id: uuid.UUID, body: ShotReviewInput,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = _session_locked(db, user, session_id, write=True)
    analysis = item.analysis if isinstance(item.analysis, dict) else {}
    duration = _duration(analysis)
    digest = _digest(analysis)
    if body.source_analysis_sha256 != digest:
        raise HTTPException(409, "Analysis changed since this review was prepared; refresh the shot report.")
    catalog = _candidate_catalog(analysis, duration)
    manual = _MANUAL_ID.fullmatch(body.candidate_id) is not None
    if body.candidate_id not in catalog and not manual:
        raise HTTPException(404, "Shot candidate not found. Use a manual-<stable-id> identifier for a manually added interval.")
    if body.decision == "confirmed":
        interval = body.interval_ms
        if not isinstance(interval, dict) or set(interval) != {"start_ms", "end_ms"}:
            raise HTTPException(422, "Confirming a shot requires interval_ms with start_ms and end_ms.")
        start, end = interval["start_ms"], interval["end_ms"]
        if not _finite(start) or not _finite(end) or start < 0 or end <= start or end > duration:
            raise HTTPException(422, "Confirmed interval must satisfy 0 <= start_ms < end_ms <= source duration_ms.")
        interval = {"start_ms": float(start), "end_ms": float(end)}
    else:
        if body.interval_ms is not None:
            raise HTTPException(422, "Rejected reviews must omit interval_ms.")
        interval = None
    rows, latest = _latest_reviews(db, item.id)
    # Ignore superseded reviews and this candidate's prior state.
    for cid, previous in latest.items():
        if cid == body.candidate_id or previous.source_analysis_sha256 != digest or previous.decision != "confirmed" or not previous.interval_ms:
            continue
        other = previous.interval_ms
        if interval and max(interval["start_ms"], other["start_ms"]) < min(interval["end_ms"], other["end_ms"]):
            raise HTTPException(409, f"Confirmed interval overlaps the confirmed shot {cid!r}.")
    release = _release_for_interval(catalog, interval) if body.decision == "confirmed" else None
    review_count = db.scalar(select(func.count()).select_from(ShotReview).where(ShotReview.session_id == item.id)) or 0
    if review_count >= _MAX_REVIEWS_PER_SESSION:
        raise HTTPException(409, "This session has reached its shot-review history limit.")
    record = ShotReview(session_id=item.id, reviewer_id=user.id, candidate_id=body.candidate_id,
        source_analysis_sha256=digest, decision=body.decision, interval_ms=interval,
        release=release, note=body.note)
    db.add(record)
    db.flush()
    access.audit(db, user, "session.shot_reviewed", item.id,
                 {"candidate_id": body.candidate_id, "decision": body.decision,
                  "source_analysis_sha256": digest})
    db.flush()
    return {"review": _view_review(record), "report": _report(db, item)}
