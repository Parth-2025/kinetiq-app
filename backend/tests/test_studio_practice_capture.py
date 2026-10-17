"""Experimental practice capture stores provenance and evidence, not player metrics."""
from db.models import User
from studio.models import Practice, StudioAccount, Team
from studio.practice_capture_models import PracticeCameraSource


def _coach_practice(db, user):
    account = db.get(StudioAccount, user.id)
    if account:
        account.role = "coach"
    else:
        db.add(StudioAccount(user_id=user.id, role="coach"))
    team = Team(owner_id=user.id, name="Capture team", sport="basketball")
    db.add(team)
    db.flush()
    practice = Practice(owner_id=user.id, team_id=team.id, title="Camera review", roster=[])
    db.add(practice)
    db.flush()
    return practice


def test_practice_capture_limits_sources_and_requires_owner(client, as_user, db_session):
    owner = as_user(auth0_sub="auth0|capture-owner")
    other = User(auth0_sub="auth0|capture-other", name="Other")
    db_session.add(other)
    db_session.flush()
    practice = _coach_practice(db_session, owner)
    for idx in range(3):
        response = client.post(f"/studio/practices/{practice.id}/camera-sources", json={"label": f"Camera {idx+1}"})
        assert response.status_code == 201
    response = client.post(f"/studio/practices/{practice.id}/camera-sources", json={"label": "Fourth"})
    assert response.status_code == 409
    import main
    from auth.dependency import current_user
    main.app.dependency_overrides[current_user] = lambda: other
    assert client.get(f"/studio/practices/{practice.id}/camera-sources").status_code == 403


def test_calibration_checks_both_coordinate_spaces_and_sync_evidence_status(client, as_user, db_session):
    user = as_user(auth0_sub="auth0|capture-calibration")
    practice = _coach_practice(db_session, user)
    source = PracticeCameraSource(practice_id=practice.id, owner_id=user.id, label="Baseline")
    db_session.add(source)
    db_session.flush()
    path = f"/studio/practices/{practice.id}/camera-sources/{source.id}"
    invalid = client.put(f"{path}/calibration", json={"court_width":15,"court_length":28,
        "landmarks":[[0,0,0,0],[1,0,2,0],[2,0,4,0],[3,0,6,0]]})
    assert invalid.status_code == 422
    calibrated = client.put(f"{path}/calibration", json={"court_width":15,"court_length":28,
        "landmarks":[[0,0,0,0],[1,0,15,0],[0,1,0,28],[1,1,15,28]]})
    assert calibrated.status_code == 200
    assert calibrated.json()["calibration"]["status"] == "calibrated"
    synced = client.put(f"{path}/synchronization", json={"method":"manual","offset_seconds":0,
        "uncertainty_seconds":0.8,"evidence":"manual estimate"})
    assert synced.status_code == 200
    assert synced.json()["synchronization"]["status"] == "evidence_recorded"
    listing = client.get(f"/studio/practices/{practice.id}/camera-sources").json()
    assert listing["review_status"] == "setup_incomplete"


def test_uploaded_source_file_is_private_and_deleted_with_source(client, as_user, db_session, tmp_path, monkeypatch):
    from settings import settings
    user = as_user(auth0_sub="auth0|capture-upload")
    practice = _coach_practice(db_session, user)
    source = PracticeCameraSource(practice_id=practice.id, owner_id=user.id, label="Sideline",
        calibration={"status": "calibrated"}, synchronization={"status": "evidence_recorded"})
    db_session.add(source)
    db_session.flush()
    monkeypatch.setattr(settings, "studio_media_dir", tmp_path)
    import cv2
    import numpy as np
    recording = tmp_path / "fixture.mp4"
    writer = cv2.VideoWriter(str(recording), cv2.VideoWriter_fourcc(*"mp4v"), 10, (32, 32))
    for _ in range(20):
        writer.write(np.zeros((32, 32, 3), dtype=np.uint8))
    writer.release()
    video_bytes = recording.read_bytes()
    endpoint = f"/studio/practices/{practice.id}/camera-sources/{source.id}/video"
    spoof = client.post(f"{endpoint}?duration_seconds=2", files={"video": ("fake.mp4", b"fake-video", "video/mp4")})
    assert spoof.status_code == 415
    mismatch = client.post(f"{endpoint}?duration_seconds=100", files={"video": ("camera.mp4", video_bytes, "video/mp4")})
    assert mismatch.status_code == 422
    response = client.post(f"{endpoint}?duration_seconds=2", files={"video": ("camera.mp4", video_bytes, "video/mp4")})
    assert response.status_code == 201
    saved = db_session.get(PracticeCameraSource, source.id)
    assert saved.media_path and saved.bytes == len(video_bytes)
    assert saved.duration_seconds == 2
    assert saved.calibration == {} and saved.synchronization == {}
    replacement = client.post(f"{endpoint}?duration_seconds=2", files={"video": ("replacement.mp4", video_bytes, "video/mp4")})
    assert replacement.status_code == 409
    assert "media_path" not in response.json()
    media_path = saved.media_path
    assert "private-camera-bytes" not in str(response.json())
    removed = client.delete(f"/studio/practices/{practice.id}/camera-sources/{source.id}")
    assert removed.status_code == 200
    assert not __import__("pathlib").Path(media_path).exists()
