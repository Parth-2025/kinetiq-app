"""Persistence and access tests for immutable experimental display rig revisions."""
import math

from db.models import User
from studio.models import Athlete, Membership, Measurement, SessionShare, Team, TrainingSession
from studio.rig_models import DisplayRigRevision


def _analysis(offset=0.0):
    frames = []
    for index in range(3):
        points = [[0.0, 0.0, 0.0, 0.9] for _ in range(33)]
        points[11] = [-0.25 + offset, 1.0, 0.0, 0.9]
        points[12] = [0.25 + offset, 1.0, 0.0, 0.9]
        points[13] = [-0.65 + offset, 0.7 + index * 0.01, 0.0, 0.9]
        points[14] = [0.65 + offset, 0.7 + index * 0.01, 0.0, 0.9]
        points[15] = [-0.9 + 2 * offset, 0.45 + index * 0.01, 0.0, 0.9]
        points[16] = [0.9 + 2 * offset, 0.45 + index * 0.01, 0.0, 0.9]
        points[23] = [-0.15, 0.0, 0.0, 0.9]
        points[24] = [0.15, 0.0, 0.0, 0.9]
        points[25] = [-0.15, -0.45, 0.0, 0.9]
        points[26] = [0.15, -0.45, 0.0, 0.9]
        points[27] = [-0.15, -0.9, 0.0, 0.9]
        points[28] = [0.15, -0.9, 0.0, 0.9]
        points[31] = [-0.15, -0.9, 0.1, 0.9]
        points[32] = [0.15, -0.9, 0.1, 0.9]
        frames.append({"time_ms": 100 + index * 65, "source_frame_index": index,
                       "quality": "usable", "points": points})
    return {"version": "studio-motion-1", "provider": "mediapipe-heavy-world",
            "provider_version": "test-v1", "model_sha256": "a" * 64,
            "coordinate_system": "mediapipe_world_hip_relative_meters",
            "timestamp_mode": "decoded_presentation", "angle_convention": "flexion_0_at_extension",
            "frames": frames}


def _make_session(db, owner, athlete, measurement, *, analysis=None):
    item = TrainingSession(owner_id=owner.id, athlete_id=athlete.id,
        measurement_id=measurement.id if measurement else None,
        skill_id="basketball.free-throw", status="ready", source={"source_retained": False},
        metrics={}, analysis=analysis or _analysis())
    db.add(item)
    db.flush()
    return item


def test_build_reuses_same_input_and_new_snapshot_creates_immutable_revision(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-idempotency-owner", name="Rig Owner")
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    measurement = Measurement(athlete_id=athlete.id, actor_id=owner.id,
                              values={"height_cm": 180, "provenance": "measured"})
    db_session.add(measurement)
    db_session.flush()
    session = _make_session(db_session, owner, athlete, measurement)

    url = f"/studio/sessions/{session.id}/rig-revisions"
    first = client.post(url)
    assert first.status_code == 200, first.text
    original = first.json()
    assert original["rig"]["status"] in {"available", "partial"}
    assert original["rig"]["measurement_snapshot_id"] == str(measurement.id)
    assert original["artifact_sha256"]
    assert client.post(url).json() == original
    assert db_session.query(DisplayRigRevision).filter_by(session_id=session.id).count() == 1

    next_measurement = Measurement(athlete_id=athlete.id, actor_id=owner.id,
                                   values={"height_cm": 181, "provenance": "measured"})
    db_session.add(next_measurement)
    db_session.flush()
    session.measurement_id = next_measurement.id
    db_session.flush()
    changed = client.post(url)
    assert changed.status_code == 200, changed.text
    revised = changed.json()
    assert revised["id"] != original["id"]
    assert revised["input_sha256"] != original["input_sha256"]
    assert revised["artifact_sha256"] != original["artifact_sha256"]
    assert revised["rig"]["measurement_context"]["height_cm"] == 181

    saved_original = client.get(f"{url}/{original['id']}")
    assert saved_original.status_code == 200
    assert saved_original.json() == original
    assert db_session.query(DisplayRigRevision).filter_by(session_id=session.id).count() == 2


def test_input_and_artifact_hashes_track_analysis_changes(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-analysis-owner", name="Rig Owner")
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    session = _make_session(db_session, owner, athlete, None)
    url = f"/studio/sessions/{session.id}/rig-revisions"
    first = client.post(url)
    assert first.status_code == 200, first.text
    session.analysis = _analysis(offset=0.03)
    db_session.flush()
    second = client.post(url)
    assert second.status_code == 200, second.text
    assert first.json()["input_sha256"] != second.json()["input_sha256"]
    assert first.json()["artifact_sha256"] != second.json()["artifact_sha256"]
    assert second.json()["rig"]["measurement_snapshot_id"] is None
    assert second.json()["rig"]["measurement_context"] == {}


def test_shared_reader_can_read_but_only_owner_can_build_and_revocation_applies(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-share-owner", name="Owner")
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    measurement = Measurement(athlete_id=athlete.id, actor_id=owner.id, values={})
    db_session.add(measurement)
    db_session.flush()
    session = _make_session(db_session, owner, athlete, measurement)
    build_url = f"/studio/sessions/{session.id}/rig-revisions"
    created = client.post(build_url)
    assert created.status_code == 200, created.text
    revision = created.json()

    coach = User(auth0_sub="auth0|rig-share-coach", name="Coach")
    db_session.add(coach)
    db_session.flush()
    team = Team(owner_id=coach.id, name="Team", sport="basketball")
    db_session.add(team)
    db_session.flush()
    membership = Membership(team_id=team.id, athlete_id=athlete.id, active=True)
    share = SessionShare(session_id=session.id, team_id=team.id)
    db_session.add_all([membership, share])
    db_session.flush()
    from main import app
    from auth.dependency import current_user
    app.dependency_overrides[current_user] = lambda: coach

    assert client.post(build_url).status_code == 403
    listed = client.get(build_url)
    assert listed.status_code == 200
    assert len(listed.json()["revisions"]) == 1
    fetched = client.get(f"{build_url}/{revision['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["rig"] == revision["rig"]

    membership.active = False
    db_session.flush()
    assert client.get(build_url).status_code == 404
    assert client.get(f"{build_url}/{revision['id']}").status_code == 404


def test_foreign_measurement_snapshot_is_rejected(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-measurement-owner", name="Owner")
    other = User(auth0_sub="auth0|rig-measurement-other", name="Other")
    db_session.add(other)
    db_session.flush()
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    another_athlete = Athlete(creator_id=other.id, name="Other Athlete", sport="basketball")
    db_session.add_all([athlete, another_athlete])
    db_session.flush()
    foreign_measurement = Measurement(athlete_id=another_athlete.id, actor_id=other.id, values={"height_cm": 190})
    db_session.add(foreign_measurement)
    db_session.flush()
    session = TrainingSession(owner_id=owner.id, athlete_id=athlete.id,
        measurement_id=foreign_measurement.id, skill_id="basketball.free-throw", status="ready",
        source={}, metrics={}, analysis=_analysis())
    db_session.add(session)
    db_session.flush()

    response = client.post(f"/studio/sessions/{session.id}/rig-revisions")
    assert response.status_code == 422
    assert db_session.query(DisplayRigRevision).filter_by(session_id=session.id).count() == 0


def test_unsupported_analysis_and_not_ready_do_not_persist(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-unavailable-owner", name="Owner")
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    bad = _make_session(db_session, owner, athlete, None, analysis={"legacy": True})
    unsupported = client.post(f"/studio/sessions/{bad.id}/rig-revisions")
    assert unsupported.status_code == 422
    assert db_session.query(DisplayRigRevision).filter_by(session_id=bad.id).count() == 0
    bad.status = "processing"
    db_session.flush()
    pending = client.post(f"/studio/sessions/{bad.id}/rig-revisions")
    assert pending.status_code == 409
    assert db_session.query(DisplayRigRevision).filter_by(session_id=bad.id).count() == 0


def test_data_export_includes_only_revisions_for_exportable_sessions(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-export-owner", name="Owner")
    athlete = Athlete(creator_id=owner.id, name="Owner athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    owned_session = _make_session(db_session, owner, athlete, None)
    owner_revision = client.post(f"/studio/sessions/{owned_session.id}/rig-revisions")
    assert owner_revision.status_code == 200, owner_revision.text

    other = User(auth0_sub="auth0|rig-export-other", name="Other")
    db_session.add(other)
    db_session.flush()
    other_athlete = Athlete(creator_id=other.id, name="Other athlete", sport="basketball")
    db_session.add(other_athlete)
    db_session.flush()
    other_session = _make_session(db_session, other, other_athlete, None)
    from main import app
    from auth.dependency import current_user
    app.dependency_overrides[current_user] = lambda: other
    other_revision = client.post(f"/studio/sessions/{other_session.id}/rig-revisions")
    assert other_revision.status_code == 200, other_revision.text
    app.dependency_overrides[current_user] = lambda: owner

    exported = client.get("/studio/data-export")
    assert exported.status_code == 200, exported.text
    revision_ids = {item["id"] for item in exported.json()["display_rig_revisions"]}
    assert revision_ids == {owner_revision.json()["id"]}


def test_session_deletion_removes_rig_revisions_from_storage_and_export(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|rig-delete-owner", name="Owner")
    athlete = Athlete(creator_id=owner.id, name="Athlete", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    session = _make_session(db_session, owner, athlete, None)
    revision = client.post(f"/studio/sessions/{session.id}/rig-revisions")
    assert revision.status_code == 200, revision.text
    assert db_session.query(DisplayRigRevision).filter_by(session_id=session.id).count() == 1

    deleted = client.delete(f"/studio/sessions/{session.id}")
    assert deleted.status_code == 200, deleted.text
    assert db_session.query(DisplayRigRevision).filter_by(session_id=session.id).count() == 0
    assert client.get(f"/studio/sessions/{session.id}/rig-revisions").status_code == 404
    exported = client.get("/studio/data-export")
    assert exported.status_code == 200, exported.text
    assert exported.json()["display_rig_revisions"] == []
