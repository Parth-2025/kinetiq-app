"""Database-backed access control coverage for comparison endpoints."""
from db.models import User
from studio.models import Athlete, Membership, StudioAccount, Team, TrainingSession


def _activate(user):
    import main
    from auth.dependency import current_user

    main.app.dependency_overrides[current_user] = lambda: user


def _ready_session(db, owner, athlete):
    item = TrainingSession(
        owner_id=owner.id,
        athlete_id=athlete.id,
        skill_id="basketball.free-throw",
        status="ready",
        source={},
        metrics={"elbow_flexion": 72},
        analysis={"frames": [{"elbow_flexion": 72, "quality": "usable"}]},
    )
    db.add(item)
    db.flush()
    return item


def test_comparison_routes_enforce_athlete_and_coach_session_access(client, as_user, db_session):
    athlete_user = as_user(auth0_sub="auth0|comparison-athlete", name="Ari")
    db_session.add(StudioAccount(user_id=athlete_user.id, role="athlete"))
    athlete = Athlete(
        creator_id=athlete_user.id,
        account_id=athlete_user.id,
        name="Ari",
        sport="basketball",
        dominant_side="right",
    )
    coach = User(auth0_sub="auth0|comparison-coach", name="Coach")
    unrelated = User(auth0_sub="auth0|comparison-unrelated", name="Unrelated")
    db_session.add_all([athlete, coach, unrelated])
    db_session.flush()
    db_session.add(StudioAccount(user_id=coach.id, role="coach"))
    team = Team(owner_id=coach.id, name="North", sport="basketball")
    db_session.add(team)
    db_session.flush()
    db_session.add(Membership(team_id=team.id, athlete_id=athlete.id, active=True))
    session = _ready_session(db_session, coach, athlete)

    query = f"athlete_id={athlete.id}"
    comparison = f"/studio/comparison?{query}"
    motion_query = f"/studio/motion-query?{query}"

    _activate(athlete_user)
    athlete_comparison = client.get(comparison)
    assert athlete_comparison.status_code == 200
    assert athlete_comparison.json()["athlete_id"] == str(athlete.id)
    # Motion query is explicitly limited to coaches, including an athlete querying their own data.
    assert client.get(motion_query).status_code == 403

    _activate(coach)
    coach_comparison = client.get(comparison)
    assert coach_comparison.status_code == 200
    assert coach_comparison.json()["sessions"][0]["session_id"] == str(session.id)
    coach_motion_query = client.get(motion_query)
    assert coach_motion_query.status_code == 200
    assert coach_motion_query.json()["sessions"][0]["session_id"] == str(session.id)

    _activate(unrelated)
    assert client.get(comparison).status_code == 404
    assert client.get(motion_query).status_code == 403
