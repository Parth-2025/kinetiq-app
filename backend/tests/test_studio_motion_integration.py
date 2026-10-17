"""Integration coverage for canonical retained motion and its access boundary."""
import math

from db.models import User
from studio.models import Athlete, Membership, Measurement, SessionShare, StudioAccount, Team, TrainingSession


def _points(flex=30):
    points = [[0.0, 0.0, 0.0, 0.9] for _ in range(33)]
    theta = math.radians(flex)
    points[11] = [1.0, 0.0, 0.0, 0.9]
    points[13] = [0.0, 0.0, 0.0, 0.9]
    points[15] = [-math.cos(theta), math.sin(theta), 0.0, 0.9]
    return points


def _analysis():
    return {
        "version": "studio-motion-1",
        "provider": "mediapipe-heavy-world",
        "provider_version": "test-model-v1",
        "model_sha256": "a" * 64,
        "coordinate_system": "mediapipe_world_hip_relative_meters",
        "timestamp_mode": "decoded_presentation",
        "angle_convention": "flexion_0_at_extension",
        "sampling_interval_ms": 65,
        "frames": [
            {"time_ms": 100, "source_frame_index": 7, "quality": "usable", "points": _points(30)},
            {"time_ms": 165, "source_frame_index": 11, "quality": "usable", "points": _points(45)},
        ],
    }


def _session(db, owner, athlete, measurement):
    item = TrainingSession(
        owner_id=owner.id, athlete_id=athlete.id, measurement_id=measurement.id,
        skill_id="basketball.free-throw", status="ready",
        source={"source_retained": False},
        metrics={}, analysis=_analysis(),
    )
    db.add(item)
    db.flush()
    return item


def _query_payload():
    return {"operation": "joint_angle_series", "joint": "left_elbow",
            "convention": "flexion_0_at_extension",
            "interval_seconds": {"start": 0, "end": 1},
            "aggregation": ["min", "max", "mean"]}


def test_retained_record_remains_available_after_source_deletion(client, as_user, db_session, tmp_path, monkeypatch):
    coach = as_user(auth0_sub="auth0|motion-integration-owner", name="Motion Coach")
    db_session.add(StudioAccount(user_id=coach.id, role="coach"))
    athlete = Athlete(creator_id=coach.id, name="Motion Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    measurement = Measurement(athlete_id=athlete.id, actor_id=coach.id, values={"height_cm": 180})
    db_session.add(measurement)
    db_session.flush()
    item = _session(db_session, coach, athlete, measurement)
    from settings import settings
    monkeypatch.setattr(settings, "studio_media_dir", tmp_path)
    source_file = tmp_path / f"{item.id}.video"
    source_file.write_bytes(b"synthetic temporary source; decoding is not part of this test")
    source_file.unlink()
    assert item.source["source_retained"] is False
    assert not source_file.exists()

    canonical = client.get(f"/studio/sessions/{item.id}/motion")
    assert canonical.status_code == 200
    record = canonical.json()
    assert record["status"] == "available"
    assert record["source_retention"] == "deleted"
    assert record["measurement_snapshot_id"] == str(measurement.id)
    assert [f["decoded_frame_index"] for f in record["frames"]] == [7, 11]

    queried = client.post(f"/studio/sessions/{item.id}/motion-query", json=_query_payload())
    assert queried.status_code == 200
    result = queried.json()
    assert result["measurement_snapshot_id"] == str(measurement.id)
    assert result["revision_id"] == f"sha256:{record['reconstruction_revision_sha256']}"
    assert result["valid_samples"] == 2
    assert result["aggregations"] == {"min": 30, "max": 45, "mean": 37.5}


def test_team_roster_alone_does_not_grant_private_session_but_share_and_active_membership_do(
        client, as_user, db_session):
    athlete_user = as_user(auth0_sub="auth0|motion-integration-athlete", name="Athlete")
    db_session.add(StudioAccount(user_id=athlete_user.id, role="athlete"))
    coach = User(auth0_sub="auth0|motion-integration-coach", name="Coach")
    db_session.add(coach)
    db_session.flush()
    db_session.add(StudioAccount(user_id=coach.id, role="coach"))
    athlete = Athlete(creator_id=athlete_user.id, account_id=athlete_user.id,
                      name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    measurement = Measurement(athlete_id=athlete.id, actor_id=athlete_user.id, values={})
    db_session.add(measurement)
    db_session.flush()
    item = _session(db_session, athlete_user, athlete, measurement)
    team = Team(owner_id=coach.id, name="Roster", sport="basketball")
    db_session.add(team)
    db_session.flush()
    membership = Membership(team_id=team.id, athlete_id=athlete.id, active=True)
    db_session.add(membership)
    db_session.flush()

    url = f"/studio/sessions/{item.id}"
    payload = _query_payload()
    # The roster relationship alone does not expose this athlete-owned private session.
    assert client.get(f"{url}/motion").status_code == 200  # current user is still athlete
    from main import app
    from auth.dependency import current_user
    app.dependency_overrides[current_user] = lambda: coach
    assert client.get(f"{url}/motion").status_code == 404
    assert client.post(f"{url}/motion-query", json=payload).status_code == 404

    db_session.add(SessionShare(session_id=item.id, team_id=team.id))
    db_session.flush()
    assert client.get(f"{url}/motion").status_code == 200
    assert client.post(f"{url}/motion-query", json=payload).status_code == 200

    membership.active = False
    db_session.flush()
    assert client.get(f"{url}/motion").status_code == 404
    assert client.post(f"{url}/motion-query", json=payload).status_code == 404
    membership.active = True
    db_session.flush()
    db_session.delete(db_session.query(SessionShare).filter_by(session_id=item.id, team_id=team.id).one())
    db_session.flush()
    assert client.get(f"{url}/motion").status_code == 404
    assert client.post(f"{url}/motion-query", json=payload).status_code == 404

    app.dependency_overrides[current_user] = lambda: athlete_user
    assert client.get(f"{url}/motion").status_code == 200
    assert client.post(f"{url}/motion-query", json=payload).status_code == 403
