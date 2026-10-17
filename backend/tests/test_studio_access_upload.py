"""Regression coverage for Studio session sharing and recording lifecycle."""
from db.models import User
from studio.models import Athlete, Membership, SessionShare, StudioAccount, Team, TrainingSession


def _session(db, owner, athlete, *, status="awaiting_upload"):
    item = TrainingSession(
        owner_id=owner.id,
        athlete_id=athlete.id,
        skill_id="basketball_shot",
        status=status,
        source={"capture_mode": "rgb", "dominant_side": "right"},
        analysis={},
        metrics={},
    )
    db.add(item)
    db.flush()
    return item


def test_session_sharing_requires_current_membership_and_revokes_access(client, as_user, db_session):
    athlete_user = as_user(auth0_sub="auth0|studio-athlete", name="Athlete")
    athlete = Athlete(creator_id=athlete_user.id, account_id=athlete_user.id, name="Athlete", dominant_side="right")
    coach = User(auth0_sub="auth0|studio-coach", name="Coach")
    other_coach = User(auth0_sub="auth0|studio-other", name="Other")
    db_session.add_all([athlete, coach, other_coach])
    db_session.flush()
    team = Team(owner_id=coach.id, name="Team", sport="basketball")
    other_team = Team(owner_id=other_coach.id, name="Other team", sport="basketball")
    db_session.add_all([team, other_team])
    db_session.flush()
    membership = Membership(team_id=team.id, athlete_id=athlete.id)
    db_session.add(membership)
    item = _session(db_session, athlete_user, athlete)

    response = client.put(f"/studio/sessions/{item.id}/sharing", json={"team_ids": [str(team.id)]})
    assert response.status_code == 200
    assert client.get("/studio/sessions").status_code == 200

    _activate(coach)
    assert any(row["id"] == str(item.id) for row in client.get("/studio/sessions").json())

    _activate(athlete_user)
    response = client.put(f"/studio/sessions/{item.id}/sharing", json={"team_ids": [str(other_team.id)]})
    assert response.status_code == 400

    _activate(coach)
    response = client.delete(f"/studio/teams/{team.id}/members/{athlete.id}")
    assert response.status_code == 200
    assert client.get(f"/studio/sessions/{item.id}").status_code == 404
    assert db_session.query(SessionShare).filter_by(session_id=item.id).count() == 0


def _activate(user):
    import main
    from auth.dependency import current_user

    main.app.dependency_overrides[current_user] = lambda: user


def test_upload_queue_then_delete_cleans_recording_and_hides_session(client, as_user, db_session, tmp_path, monkeypatch):
    from settings import settings

    user = as_user(auth0_sub="auth0|studio-upload", name="Uploader")
    athlete = Athlete(creator_id=user.id, account_id=user.id, name="Uploader", dominant_side="right")
    db_session.add(athlete)
    db_session.flush()
    item = _session(db_session, user, athlete)
    monkeypatch.setattr(settings, "studio_media_dir", tmp_path)

    response = client.post(
        f"/studio/sessions/{item.id}/video",
        files={"video": ("clip.mp4", b"video-bytes", "video/mp4")},
    )
    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    video_path = tmp_path / f"{item.id}.video"
    assert video_path.read_bytes() == b"video-bytes"
    db_session.refresh(item)
    assert item.source["source_retained"] is True

    response = client.delete(f"/studio/sessions/{item.id}")
    assert response.status_code == 200
    assert not video_path.exists()
    db_session.refresh(item)
    assert item.status == "deleted"
    assert item.source == {}
    assert client.get(f"/studio/sessions/{item.id}").status_code == 404
    assert client.post(
        f"/studio/sessions/{item.id}/video",
        files={"video": ("again.mp4", b"bytes", "video/mp4")},
    ).status_code == 404


def test_upload_rejects_invalid_content_and_empty_recording(client, as_user, db_session, tmp_path, monkeypatch):
    from settings import settings

    user = as_user(auth0_sub="auth0|studio-invalid-upload", name="Uploader")
    athlete = Athlete(creator_id=user.id, account_id=user.id, name="Uploader", dominant_side="right")
    db_session.add(athlete)
    db_session.flush()
    item = _session(db_session, user, athlete)
    monkeypatch.setattr(settings, "studio_media_dir", tmp_path)

    assert client.post(
        f"/studio/sessions/{item.id}/video",
        files={"video": ("notes.txt", b"text", "text/plain")},
    ).status_code == 415
    assert client.post(
        f"/studio/sessions/{item.id}/video",
        files={"video": ("empty.mp4", b"", "video/mp4")},
    ).status_code == 400
    assert list(tmp_path.iterdir()) == []


def test_coach_cannot_edit_or_claim_another_creators_roster_athlete(client, as_user, db_session):
    creator = as_user(auth0_sub="auth0|studio-creator", name="Creator")
    athlete = Athlete(creator_id=creator.id, name="Managed athlete", dominant_side="right")
    creator_team = Team(owner_id=creator.id, name="Creator team", sport="basketball")
    db_session.add_all([athlete, creator_team])
    db_session.flush()
    db_session.add(Membership(team_id=creator_team.id, athlete_id=athlete.id))

    other = User(auth0_sub="auth0|studio-second-coach", name="Second coach")
    db_session.add(other)
    db_session.flush()
    db_session.add(StudioAccount(user_id=other.id, role="coach"))
    other_team = Team(owner_id=other.id, name="Second team", sport="basketball")
    db_session.add(other_team)
    db_session.flush()
    # The second coach can read this athlete because of their roster membership.
    db_session.add(Membership(team_id=other_team.id, athlete_id=athlete.id))
    db_session.flush()
    _activate(other)

    edited = client.patch(
        f"/studio/athletes/{athlete.id}",
        json={"name": "Taken over", "sport": "basketball", "dominant_side": "left"},
    )
    assert edited.status_code == 403
    assert client.post(
        f"/studio/teams/{other_team.id}/members", json={"athlete_id": str(athlete.id)}
    ).status_code == 403
    assert client.post(
        "/studio/sessions",
        json={"skill_id": "basketball.free-throw", "athlete_id": str(athlete.id)},
    ).status_code == 403

    assert client.post(
        "/studio/assignments",
        json={"title": "Direct workout", "skill_id": "basketball.free-throw", "athlete_id": str(athlete.id)},
    ).status_code == 403

    _activate(creator)
    db_session.add(StudioAccount(user_id=creator.id, role="coach"))
    db_session.flush()
    assert client.post(
        "/studio/sessions",
        json={"skill_id": "basketball.free-throw", "athlete_id": str(athlete.id)},
    ).status_code == 201
    athlete.account_id = creator.id
    db_session.flush()
    _activate(other)
    assert client.post(
        "/studio/sessions",
        json={"skill_id": "basketball.free-throw", "athlete_id": str(athlete.id)},
    ).status_code == 201
