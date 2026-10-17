import pytest

from studio.tracking import associate_detections
from studio.models import Practice, StudioAccount, Team
from studio.practice_capture_models import PracticeCameraSource
from studio.practice_tracking_models import PracticeTrackingJob


def _frame(index, boxes, time_ms=None):
    return {
        "index": index,
        "time_ms": time_ms if time_ms is not None else index * 100,
        "detections": [
            {"bbox": box, "full_body": True, "landmark_quality": 0.9}
            for box in boxes
        ],
    }


def test_single_subject_keeps_anonymous_track_across_nearby_frames():
    result = associate_detections([
        _frame(0, [[0.1, 0.1, 0.3, 0.8]]),
        _frame(1, [[0.12, 0.1, 0.32, 0.8]]),
    ])
    first, second = [row["detections"][0] for row in result["frames"]]
    assert first["track_id"] == second["track_id"] == "track-1"
    assert second["association"] == "matched"
    assert len(result["tracks"][0]["observations"]) == 2
    assert "not people" in result["limitations"][0]


def test_close_two_person_crossing_is_marked_ambiguous():
    result = associate_detections([
        _frame(0, [[0.22, 0.2, 0.42, 0.9], [0.58, 0.2, 0.78, 0.9]]),
        _frame(1, [[0.4, 0.2, 0.6, 0.9], [0.4, 0.2, 0.6, 0.9]]),
    ])
    assert result["frames"][1]["association_ambiguous"] is True
    assert all(row["track_id"] is None for row in result["frames"][1]["detections"])


def test_gap_starts_new_track_and_invalid_box_is_ignored():
    result = associate_detections([
        _frame(0, [[0.1, 0.1, 0.3, 0.8]]),
        _frame(5, [[0.7, 0.1, 1.1, 0.8]]),
        _frame(6, [[0.7, 0.1, 0.9, 0.8]]),
    ])
    assert result["frames"][1]["detections"] == []
    assert result["frames"][2]["detections"][0]["association"] == "initialized"
    assert len(result["tracks"]) == 2


def test_rejects_nonmonotonic_frame_times():
    with pytest.raises(ValueError, match="strictly increasing"):
        associate_detections([_frame(0, []), _frame(1, [], time_ms=0)])


def _practice(db, coach):
    db.add(StudioAccount(user_id=coach.id, role="coach"))
    team = Team(owner_id=coach.id, name="Track team", sport="basketball")
    db.add(team)
    db.flush()
    practice = Practice(owner_id=coach.id, team_id=team.id, title="Tracking review", roster=[])
    db.add(practice)
    db.flush()
    source = PracticeCameraSource(practice_id=practice.id, owner_id=coach.id, label="Sideline",
                                 media_path="private/recording.mp4")
    db.add(source)
    db.flush()
    return practice, source


def test_tracking_job_is_private_and_never_invents_track_links(client, as_user, db_session):
    coach = as_user(auth0_sub="auth0|tracking-owner")
    practice, source = _practice(db_session, coach)
    url = f"/studio/practices/{practice.id}/camera-sources/{source.id}/tracking-jobs"
    created = client.post(url)
    assert created.status_code == 201
    payload = created.json()
    assert payload["tracking_status"] == "unsupported"
    assert payload["result"]["tracks"] == []

    import main
    from auth.dependency import current_user
    from db.models import User
    other = User(auth0_sub="auth0|tracking-other", name="Other")
    db_session.add(other)
    db_session.flush()
    db_session.add(StudioAccount(user_id=other.id, role="coach"))
    main.app.dependency_overrides[current_user] = lambda: other
    assert client.get(f"/studio/practices/{practice.id}/tracking-jobs").status_code == 404

    main.app.dependency_overrides[current_user] = lambda: coach
    linked = client.put(
        f"/studio/practices/{practice.id}/tracking-jobs/{payload['id']}/tracks/fabricated/link",
        json={"athlete_id": None},
    )
    assert linked.status_code == 404


def test_tracking_job_requires_uploaded_source_and_coach_role(client, as_user, db_session):
    coach = as_user(auth0_sub="auth0|tracking-no-video")
    practice, source = _practice(db_session, coach)
    source.media_path = None
    db_session.flush()
    url = f"/studio/practices/{practice.id}/camera-sources/{source.id}/tracking-jobs"
    assert client.post(url).status_code == 409

    import main
    from auth.dependency import current_user
    from db.models import User
    athlete = User(auth0_sub="auth0|tracking-athlete", name="Athlete")
    db_session.add(athlete)
    db_session.flush()
    main.app.dependency_overrides[current_user] = lambda: athlete
    assert client.get(f"/studio/practices/{practice.id}/tracking-jobs").status_code == 403
