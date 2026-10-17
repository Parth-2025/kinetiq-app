"""Deterministic interval geometry and route authorization coverage."""
import math
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio.models import Athlete, StudioAccount, Team, TrainingSession
from studio.session_query import MAX_OUTPUT_SAMPLES, content_revision, query
from studio.session_query_routes import router


def _frame(time_ms, points=None, quality="usable"):
    return {"time_ms": time_ms, "points": points or [None] * 33, "quality": quality}


def _known_points(flex=0, vis=0.9):
    # Center at the elbow; extension is 180 degrees between segments and flexion 0.
    points = [[0.0, 0.0, 0.0, vis] for _ in range(33)]
    theta = math.radians(flex)
    points[11] = [1.0, 0.0, 0.0, vis]
    points[13] = [0.0, 0.0, 0.0, vis]
    points[15] = [-math.cos(theta), math.sin(theta), 0.0, vis]
    return points


def _analysis(frames):
    return {"version": "studio-motion-1", "provider": "mediapipe-heavy-world",
            "angle_convention": "flexion_0_at_extension",
            "coordinate_system": "mediapipe_world_hip_relative_meters",
            "timestamp_mode": "decoded_presentation", "sampling_interval_ms": 65, "frames": frames}


def test_joint_angle_series_preserves_interval_gaps_and_aggregates():
    analysis = _analysis([_frame(0, _known_points(0)), _frame(65, _known_points(30)),
                          _frame(200, quality="multiple_people"), _frame(265, _known_points(60))])
    result = query(analysis, joint="left_elbow", start=0, end=.3,
                   aggregation=["min", "max", "mean"])
    assert [s["value"] for s in result["samples"]] == [0, 30, None, 60]
    assert result["samples"][2]["reason"] == "multiple_people"
    assert result["valid_samples"] == 3
    assert result["total_samples"] == 4
    assert result["coverage"] == pytest.approx(3 / 4, abs=.001)
    assert result["aggregations"] == {"min": 0, "max": 60, "mean": 30}
    assert result["time_basis"] == "decoded_presentation"
    assert result["sample_gaps"] == [{"start_seconds": 0.065, "end_seconds": 0.2, "gap_seconds": 0.135}]


def test_invalid_points_and_unsupported_contract_are_unavailable():
    points = _known_points(25)
    points[15][3] = .64
    result = query(_analysis([_frame(50, points)]), joint="left_elbow", start=0, end=1,
                   aggregation=["mean"])
    assert result["samples"][0]["value"] is None
    assert result["samples"][0]["reason"] == "missing_nonfinite_or_low_visibility_joint_points"
    with pytest.raises(ValueError, match="provider or version"):
        query({**_analysis([]), "provider": "legacy-provider"}, joint="left_elbow", start=0, end=1,
              aggregation=["mean"])


def test_timestamp_contract_must_be_monotonic_and_coordinate_contract_known():
    analysis = _analysis([_frame(100, _known_points()), _frame(90, _known_points())])
    with pytest.raises(ValueError, match="strictly increasing"):
        query(analysis, joint="left_elbow", start=0, end=1, aggregation=["mean"])
    unsupported = {**_analysis([]), "coordinate_system": "normalized_image_coordinates"}
    with pytest.raises(ValueError, match="contract is unsupported"):
        query(unsupported, joint="left_elbow", start=0, end=1, aggregation=["mean"])


def test_query_rejects_unsafe_stored_bounds_even_outside_requested_interval():
    for frames in ([ _frame(-1) ], [ _frame(60001) ],
                   [_frame(i) for i in range(MAX_OUTPUT_SAMPLES + 1)]):
        with pytest.raises((ValueError, OverflowError)):
            query(_analysis(frames), joint="left_elbow", start=0, end=1, aggregation=["mean"])
    for start, end in ((-1, 1), (0, 61), (1, 1), (math.nan, 1)):
        with pytest.raises(ValueError, match="within 0 to 60 seconds"):
            query(_analysis([]), joint="left_elbow", start=start, end=end, aggregation=["mean"])


def test_revision_hash_is_stable_and_content_sensitive():
    analysis = _analysis([_frame(0, _known_points())])
    assert content_revision(analysis) == content_revision(analysis)
    assert content_revision(analysis) != content_revision({**analysis, "frames": []})


def test_saved_query_route_coach_acl_and_interval_bounds(db_session):
    from fastapi.testclient import TestClient

    coach = User(auth0_sub="auth0|session-query-coach", name="Coach")
    athlete_user = User(auth0_sub="auth0|session-query-athlete", name="Athlete")
    outsider = User(auth0_sub="auth0|session-query-outsider", name="Other")
    db_session.add_all([coach, athlete_user, outsider])
    db_session.flush()
    athlete = Athlete(creator_id=athlete_user.id, account_id=athlete_user.id, name="Player", sport="basketball")
    db_session.add_all([StudioAccount(user_id=coach.id, role="coach"),
                        StudioAccount(user_id=athlete_user.id, role="athlete"),
                        StudioAccount(user_id=outsider.id, role="coach")])
    db_session.add(athlete)
    db_session.flush()
    session = TrainingSession(owner_id=coach.id, athlete_id=athlete.id, skill_id="basketball.free-throw",
        status="ready", source={}, metrics={}, analysis=_analysis([_frame(100, _known_points(20))]))
    db_session.add(session)
    db_session.flush()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db_session
    active = {"user": coach}
    app.dependency_overrides[current_user] = lambda: active["user"]
    client = TestClient(app)
    url = f"/studio/sessions/{session.id}/motion-query"
    payload = {"operation": "joint_angle_series", "joint": "left_elbow",
               "convention": "flexion_0_at_extension", "interval_seconds": {"start": 0, "end": 1},
               "aggregation": ["min", "max", "mean"]}
    response = client.post(url, json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "available"
    assert response.json()["measurement_snapshot_id"] is None
    active["user"] = athlete_user
    assert client.post(url, json=payload).status_code == 403
    active["user"] = outsider
    assert client.post(url, json=payload).status_code == 404
    active["user"] = coach
    payload["interval_seconds"] = {"start": 1, "end": 1}
    assert client.post(url, json=payload).status_code == 422
    payload["interval_seconds"] = {"start": 0, "end": 61}
    assert client.post(url, json=payload).status_code == 422
    payload["interval_seconds"] = {"start": 0, "end": 1}
    session.analysis = {**session.analysis, "provider": "unknown"}
    detail = client.post(url, json=payload).json()["detail"]
    assert detail["code"] == "unsupported_analysis_contract"
    assert detail["source_required"] is None
