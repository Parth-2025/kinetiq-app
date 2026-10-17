"""Immutable persistence API for experimental display rig revisions."""
from __future__ import annotations

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.models import Measurement, TrainingSession
from studio.motion_contract import adapt_analysis
from studio.rig_fit import ALGORITHM_VERSION, TOPOLOGY_VERSION, build_display_rig
from studio.rig_models import DisplayRigRevision

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


def _canonical_json(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _raw_analysis_sha256(analysis: dict) -> str:
    return hashlib.sha256(_canonical_json(analysis)).hexdigest()


def _input_sha256(analysis_sha256: str, measurement_id, measurement_values: dict) -> str:
    inputs = {
        "source_analysis_sha256": analysis_sha256,
        "measurement_snapshot_id": str(measurement_id) if measurement_id else None,
        "measurement_values": measurement_values,
        "algorithm_version": ALGORITHM_VERSION,
        "topology_version": TOPOLOGY_VERSION,
    }
    return hashlib.sha256(_canonical_json(inputs)).hexdigest()


def _artifact_sha256(rig: dict) -> str:
    return hashlib.sha256(_canonical_json(rig)).hexdigest()


def _revision_payload(item: DisplayRigRevision, *, include_rig: bool):
    result = {
        "id": str(item.id),
        "session_id": str(item.session_id),
        "created_at": item.created_at,
        "input_sha256": item.input_sha256,
        "artifact_sha256": item.artifact_sha256,
        "algorithm_version": item.algorithm_version,
    }
    if include_rig:
        result["rig"] = item.rig
    return result


@router.post("/sessions/{session_id}/rig-revisions")
def create_rig_revision(session_id: uuid.UUID, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    # Access first, then lock the same session row that anchors the immutable inputs.
    access.session(db, user, session_id, write=True)
    item = db.scalar(select(TrainingSession).where(TrainingSession.id == session_id)
                     .with_for_update().execution_options(populate_existing=True))
    if item is None or item.status == "deleted":
        raise HTTPException(404, "Session not found.")
    if item.status != "ready":
        raise HTTPException(409, "Display rig is available when session analysis is ready.")

    analysis = item.analysis if isinstance(item.analysis, dict) else {}
    try:
        analysis_sha = _raw_analysis_sha256(analysis)
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(422, "Stored analysis cannot be hashed for a display rig.") from exc

    measurement_values = {}
    if item.measurement_id is not None:
        measurement = db.get(Measurement, item.measurement_id)
        if measurement is None or measurement.athlete_id != item.athlete_id:
            raise HTTPException(422, "The session measurement snapshot is unavailable for this athlete.")
        measurement_values = measurement.values if isinstance(measurement.values, dict) else {}
    input_sha = _input_sha256(analysis_sha, item.measurement_id, measurement_values)
    existing = db.scalar(select(DisplayRigRevision).where(
        DisplayRigRevision.session_id == item.id,
        DisplayRigRevision.input_sha256 == input_sha,
    ))
    if existing is not None:
        return _revision_payload(existing, include_rig=True)

    motion = adapt_analysis(item.id, item.athlete_id, item.source or {}, analysis, item.measurement_id)
    if motion is None:
        raise HTTPException(422, "Stored analysis is not supported by the display rig contract.")
    try:
        rig = build_display_rig(motion, measurement_values)
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(422, "Stored analysis could not be fitted to the display rig contract.") from exc
    if rig.get("status") == "unsupported":
        raise HTTPException(422, {
            "code": "display_rig_unsupported",
            "message": "Stored motion does not contain enough supported observations to build a display rig.",
        })
    if rig.get("status") not in {"available", "partial"}:
        raise HTTPException(422, "Display rig fitting returned an unsupported result.")

    try:
        artifact_sha = _artifact_sha256(rig)
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(422, "Display rig output could not be serialized safely.") from exc
    revision = DisplayRigRevision(session_id=item.id, input_sha256=input_sha,
        artifact_sha256=artifact_sha, algorithm_version=ALGORITHM_VERSION, rig=rig)
    db.add(revision)
    db.flush()
    return _revision_payload(revision, include_rig=True)


@router.get("/sessions/{session_id}/rig-revisions")
def list_rig_revisions(session_id: uuid.UUID, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    item = access.session(db, user, session_id)
    revisions = db.scalars(select(DisplayRigRevision).where(
        DisplayRigRevision.session_id == item.id
    ).order_by(DisplayRigRevision.created_at.desc(), DisplayRigRevision.id.desc()).limit(50)).all()
    return {"revisions": [_revision_payload(row, include_rig=False) for row in revisions]}


@router.get("/sessions/{session_id}/rig-revisions/{revision_id}")
def get_rig_revision(session_id: uuid.UUID, revision_id: uuid.UUID,
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id)
    revision = db.scalar(select(DisplayRigRevision).where(
        DisplayRigRevision.id == revision_id,
        DisplayRigRevision.session_id == item.id,
    ))
    if revision is None:
        raise HTTPException(404, "Display rig revision not found.")
    return _revision_payload(revision, include_rig=True)
