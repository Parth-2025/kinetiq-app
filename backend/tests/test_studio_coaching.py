from datetime import datetime

from studio.models import Assignment, Athlete, Membership, Practice, PracticeEvent, StudioAccount, Team


def test_written_assignment_completion_persists_and_reopens(client, db_session, as_user):
    coach_user = as_user(auth0_sub="auth0|workflow-coach")
    db_session.add(StudioAccount(user_id=coach_user.id, role="coach"))
    db_session.flush()
    team = Team(owner_id=coach_user.id, name="North", sport="basketball", description="")
    db_session.add(team)
    db_session.flush()
    athlete_user = as_user(auth0_sub="auth0|workflow-athlete")
    athlete = Athlete(creator_id=athlete_user.id, account_id=athlete_user.id, name="Ari", sport="basketball")
    db_session.add_all([athlete, StudioAccount(user_id=athlete_user.id, role="athlete")])
    db_session.flush()
    db_session.add(Membership(team_id=team.id, athlete_id=athlete.id, active=True))
    assignment = Assignment(owner_id=coach_user.id, team_id=team.id, title="Footwork", skill_id="basketball.pivot", instructions="Practice both directions.", published=True)
    db_session.add(assignment)
    db_session.flush()

    from auth.dependency import current_user
    import main
    main.app.dependency_overrides[current_user] = lambda: athlete_user

    path = f"/studio/assignments/{assignment.id}/completion"
    assert client.get(path).json()["completed"] is False
    completed = client.put(path, json={"completed": True}).json()
    assert completed["completed"] is True
    repeated = client.put(path, json={"completed": True}).json()
    assert datetime.fromisoformat(repeated["completed_at"]) == datetime.fromisoformat(completed["completed_at"])
    assert client.get(path).json()["completed"] is True
    main.app.dependency_overrides[current_user] = lambda: coach_user
    coach_completion = client.get(f"/studio/assignments/{assignment.id}/completions")
    assert coach_completion.status_code == 200
    assert coach_completion.json()[0]["completed"] is True
    assert client.put(path, json={"completed": True}).status_code == 403
    main.app.dependency_overrides[current_user] = lambda: athlete_user
    reopened = client.put(path, json={"completed": False}).json()
    assert reopened["completed"] is False
    assert reopened["completed_at"] is None
    membership = db_session.query(Membership).filter_by(team_id=team.id, athlete_id=athlete.id).one()
    membership.active = False
    db_session.flush()
    assert client.get(path).status_code == 404
    assert client.put(path, json={"completed": True}).status_code == 404
    main.app.dependency_overrides[current_user] = lambda: coach_user
    assert client.get(f"/studio/assignments/{assignment.id}/completions").json() == []
    membership.active = True
    team.archived = True
    db_session.flush()
    assert client.get(f"/studio/assignments/{assignment.id}/completions").status_code == 404
    main.app.dependency_overrides[current_user] = lambda: athlete_user
    assert client.get(path).status_code == 404
    assert client.put(path, json={"completed": True}).status_code == 404


def test_practice_status_requires_owner_coach_and_valid_value(client, db_session, as_user):
    user = as_user(auth0_sub="auth0|practice-coach")
    db_session.add(StudioAccount(user_id=user.id, role="coach"))
    team = Team(owner_id=user.id, name="North", sport="basketball", description="")
    db_session.add(team)
    db_session.flush()
    practice = Practice(owner_id=user.id, team_id=team.id, title="Tuesday", notes="", roster=[], status="draft")
    db_session.add(practice)
    db_session.flush()

    response = client.patch(f"/studio/practices/{practice.id}/status", json={"status": "live"})
    assert response.status_code == 200
    assert response.json()["status"] == "live"
    invalid = client.patch(f"/studio/practices/{practice.id}/status", json={"status": "cancelled"})
    assert invalid.status_code == 422


def test_practice_edit_cannot_remove_athlete_with_recorded_events(client, db_session, as_user):
    user = as_user(auth0_sub="auth0|practice-roster-coach")
    db_session.add(StudioAccount(user_id=user.id, role="coach"))
    team = Team(owner_id=user.id, name="North", sport="basketball", description="")
    db_session.add(team)
    athlete = Athlete(creator_id=user.id, name="Ari", sport="basketball")
    db_session.add(athlete)
    db_session.flush()
    db_session.add(Membership(team_id=team.id, athlete_id=athlete.id, active=True))
    practice = Practice(owner_id=user.id, team_id=team.id, title="Tuesday", notes="", roster=[{"athlete_id": str(athlete.id), "jersey": "8", "side": "home"}], status="draft")
    db_session.add(practice)
    db_session.flush()
    db_session.add(PracticeEvent(practice_id=practice.id, athlete_id=athlete.id, actor_id=user.id,
                                 data={"kind": "shot", "timestamp_seconds": 10, "outcome": "made", "note": ""}))
    db_session.flush()

    response = client.patch(f"/studio/practices/{practice.id}", json={
        "title": "Tuesday", "team_id": str(team.id), "notes": "",
        "roster": [],
    })
    assert response.status_code == 409
    assert "must remain" in response.json()["detail"]
