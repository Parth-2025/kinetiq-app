"""Coach-only interval queries against a session's retained numeric analysis."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.session_query import (MAX_INTERVAL_SECONDS, MAX_OUTPUT_SAMPLES, SUPPORTED_CONVENTION,
                                  UnsupportedAnalysis, content_revision, query)

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


class Interval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, le=MAX_INTERVAL_SECONDS, allow_inf_nan=False)


class MotionQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["joint_angle_series"]
    joint: Literal["left_elbow", "right_elbow", "left_knee", "right_knee"]
    convention: Literal["flexion_0_at_extension"]
    interval_seconds: Interval
    aggregation: list[Literal["min", "max", "mean"]] = Field(min_length=1, max_length=3)


@router.post("/sessions/{session_id}/motion-query")
def saved_session_motion_query(session_id: uuid.UUID, body: MotionQuery,
                               user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Check role before session existence, then use the standard access-scoped resolver.
    access.coach(db, user)
    item = access.session(db, user, session_id)
    if item.status != "ready":
        raise HTTPException(409, "Session analysis is not ready.")
    start, end = body.interval_seconds.start, body.interval_seconds.end
    if end <= start or end > MAX_INTERVAL_SECONDS:
        raise HTTPException(422, "Choose an interval within 0 to 60 seconds, with end after start.")
    if body.convention != SUPPORTED_CONVENTION:
        raise HTTPException(422, "This angle convention is unsupported.")
    analysis = item.analysis if isinstance(item.analysis, dict) else {}
    try:
        result = query(analysis, joint=body.joint, start=start, end=end,
                       aggregation=body.aggregation)
        revision = content_revision(analysis)
    except OverflowError as exc:
        raise HTTPException(422, str(exc)) from exc
    except UnsupportedAnalysis as exc:
        revision = None
        try:
            revision = content_revision(analysis)
        except (TypeError, ValueError):
            pass
        raise HTTPException(422, {"code": "unsupported_analysis_contract", "status": "unsupported",
            "reason": str(exc), "session_id": str(item.id), "revision_id": revision,
            "unsupported_capabilities": ["joint_angle_series_from_retained_points"],
            "source_required": True if "source video is required" in str(exc) else None}) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    limitations = ["Experimental retained pose estimates; this query is not a validated biomechanics score.",
                   "Samples use stored numerical frames only; gaps are preserved and never interpolated.",
                   "Ball, release, outcome, and identity capabilities are unavailable."]
    return {"session_id": str(item.id), "measurement_snapshot_id": str(item.measurement_id) if item.measurement_id else None,
            "revision_id": revision,
            "metric_version": "joint-angle-v1", "unit": "deg", "convention": body.convention,
            "joint": body.joint, "interval_seconds": {"start": start, "end": end},
            "status": "available" if result["valid_samples"] else "unavailable",
            **result, "limitations": limitations,
            "unsupported_capabilities": ["ball_tracking", "release_detection", "outcome_detection", "identity_tracking"],
            "unsupported_capability_reasons": {
                "ball_tracking": "studio-motion-1 stores body landmarks only.",
                "release_detection": "No ball or release annotations are retained.",
                "outcome_detection": "No ball outcome evidence is retained.",
                "identity_tracking": "The stored single-person quality gate is not validated identity tracking."},
            "bounds": {"maximum_interval_seconds": MAX_INTERVAL_SECONDS,
                       "maximum_output_samples": MAX_OUTPUT_SAMPLES}}
