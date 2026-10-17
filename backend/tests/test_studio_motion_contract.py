import math
import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from db.models import User
from studio.models import Athlete, TrainingSession
from studio.motion_contract import CanonicalFrame, CanonicalMotionSession, JOINT_NAMES, adapt_analysis
from studio.motion_routes import get_motion


def _record(version="studio-motion-1", times=(0, 65)):
    frames = []
    for ms in times:
        points = [None] * 33
        points[0] = [0.25, 0.5, 0.75, 0.9]
        points[1] = [1.0, 2.0, 3.0, 0.4]  # low visibility becomes explicitly missing
        points[2] = [0.0, 0.0, 0.0, 0.65]
        frames.append({"time_ms": ms, "points": points, "quality": "partial_body_or_occlusion"})
    return {"version": version, "provider": "mediapipe-heavy-world", "model_sha256": "a" * 64,
            "coordinate_system": "mediapipe_world_hip_relative_meters", "timestamp_mode": "decoded_presentation",
            "angle_convention": "flexion_0_at_extension",
            "frames": frames}


def test_adapter_maps_coordinates_and_preserves_quality_nulls_and_provenance():
    sid, aid = uuid.uuid4(), uuid.uuid4()
    raw = _record()
    result = adapt_analysis(sid, aid, {"capture_mode": "rgb"}, raw)
    assert result is not None
    assert result.frames[0].positions_m[0] == [0.25, -0.5, -0.75]
    assert result.frames[0].positions_m[1] is None
    assert result.frames[0].visibility[1] == 0.4
    assert result.frames[0].positions_m[2] == [0, 0, 0]
    assert result.frames[0].quality == "partial_body_or_occlusion"
    assert [f.source_sample_id for f in result.frames] == [None, None]
    assert result.time_basis == "decoded_presentation_time"
    assert result.scale_source == "model_estimated"
    assert result.root_trajectory_available is False
    assert result.capabilities.mesh_reconstruction is False
    assert result.source_retention == "unknown"
    assert result.provider_version is None
    assert result.coordinate_frame == "hip_root_relative_model"
    assert result.axis_convention == "x_right_y_up_z_toward_camera"
    assert [f.sample_index for f in result.frames] == [0, 1]
    assert all(f.decoded_frame_index is None and f.original_frame_index is None for f in result.frames)
    assert len(result.reconstruction_revision_sha256) == 64
    assert result.model_dump(mode="json")["schema_version"] == "motion_session.v1"


@pytest.mark.parametrize("mutate", ["nan", "degenerate", "timestamps"])
def test_adapter_rejects_invalid_nonfinite_degenerate_or_nonmonotonic_data(mutate):
    raw = _record()
    if mutate == "nan":
        raw["frames"][0]["points"][0][0] = float("nan")
    elif mutate == "degenerate":
        raw["frames"][0]["points"][0] = [1.0, 2.0, 3.0]  # no confidence component
    else:
        raw["frames"][1]["time_ms"] = 0
    assert adapt_analysis(uuid.uuid4(), uuid.uuid4(), {}, raw) is None


def test_contract_validation_rejects_nan_timestamp_and_nonmonotonic_samples():
    with pytest.raises(ValidationError):
        CanonicalFrame(time_s=float("nan"), source_sample_id=None, quality="usable",
                       positions_m=[None] * 33, visibility=[None] * 33)
    base = dict(session_id=uuid.uuid4(), subject_athlete_id=uuid.uuid4(), provider="mediapipe-heavy-world", provider_version=None,
        provider_model_sha256="a" * 64, source_record_version="studio-motion-1",
        source_coordinate_convention="mediapipe_world_hip_relative_meters", time_basis="nominal_fallback",
        source_retention="unknown", reconstruction_revision_sha256="b" * 64, joint_names=list(JOINT_NAMES))
    one = CanonicalFrame(time_s=1, source_sample_id=None, sample_index=0, quality="usable", positions_m=[None] * 33, visibility=[None] * 33)
    with pytest.raises(ValidationError):
        CanonicalMotionSession(**base, frames=[one, one])


def test_legacy_records_are_explicitly_unsupported():
    assert adapt_analysis(uuid.uuid4(), uuid.uuid4(), {}, {"version": "legacy_v1", "frames": []}) is None
    unsupported = adapt_analysis(uuid.uuid4(), uuid.uuid4(), {}, _record(version="studio-motion-2"))
    assert unsupported is None


@pytest.mark.parametrize("field,value", [("provider", "other-provider"),
    ("angle_convention", "extension_0_at_flexion"), ("angle_convention", None)])
def test_adapter_rejects_spoofed_provider_or_angle_convention(field, value):
    raw = _record()
    raw[field] = value
    assert adapt_analysis(uuid.uuid4(), uuid.uuid4(), {}, raw) is None


def test_adapter_preserves_recorded_ids_version_retention_and_revision():
    raw = _record()
    raw["provider_version"] = "0.10.0"
    raw["frames"][0]["source_sample_id"] = "capture-17"
    raw["frames"][0]["source_frame_index"] = 17
    snapshot = uuid.uuid4()
    sid, aid = uuid.uuid4(), uuid.uuid4()
    retained = adapt_analysis(sid, aid, {"source_retained": True}, raw, snapshot)
    deleted = adapt_analysis(sid, aid, {"source_retained": False}, raw, snapshot)
    assert retained.source_retention == "retained"
    assert deleted.source_retention == "deleted"
    assert retained.provider_version == "0.10.0"
    assert retained.frames[0].source_sample_id == "capture-17"
    assert retained.frames[0].decoded_frame_index == 17
    assert retained.frames[0].original_frame_index is None
    assert retained.measurement_snapshot_id == snapshot
    assert retained.reconstruction_revision_sha256 == deleted.reconstruction_revision_sha256
    raw["frames"][0]["source_frame_index"] = 18
    changed = adapt_analysis(sid, aid, {}, raw)
    assert changed.reconstruction_revision_sha256 != retained.reconstruction_revision_sha256


def test_authenticated_motion_route_applies_session_access_and_explicit_legacy_response(db_session, as_user):
    owner = as_user(auth0_sub="auth0|motion-owner")
    athlete = Athlete(creator_id=owner.id, account_id=owner.id, name="Athlete", sport="basketball", dominant_side="right")
    db_session.add(athlete)
    db_session.flush()
    session = TrainingSession(owner_id=owner.id, athlete_id=athlete.id, skill_id="basketball.jump-shot",
                              status="ready", source={}, analysis={"version": "legacy_v1"})
    db_session.add(session)
    db_session.flush()
    response = get_motion(session.id, owner, db_session)
    assert response["status"] == "unsupported"
    assert response["reason"] == "legacy_or_unrecognized_motion_record"
    stranger = User(auth0_sub="auth0|motion-stranger", name="Stranger")
    db_session.add(stranger)
    db_session.flush()
    with pytest.raises(HTTPException) as exc:
        get_motion(session.id, stranger, db_session)
    assert exc.value.status_code == 404


def test_motion_route_rejects_unfinished_session_even_with_stale_analysis(db_session, as_user):
    owner = as_user(auth0_sub="auth0|motion-pending-owner")
    athlete = Athlete(creator_id=owner.id, account_id=owner.id, name="Athlete", sport="basketball", dominant_side="right")
    db_session.add(athlete)
    db_session.flush()
    session = TrainingSession(owner_id=owner.id, athlete_id=athlete.id, skill_id="basketball.jump-shot",
                              status="processing", source={}, analysis=_record())
    db_session.add(session)
    db_session.flush()
    with pytest.raises(HTTPException) as exc:
        get_motion(session.id, owner, db_session)
    assert exc.value.status_code == 409
