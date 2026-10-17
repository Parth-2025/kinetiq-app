import datetime as dt

import pytest

from studio.claim_models import AthleteClaim
from studio.models import Athlete, AuditEvent, Membership, StudioAccount, Team, TrainingSession


@pytest.fixture
def claim_router(client):
    import main
    from studio.claim_routes import router
    if not any(getattr(route, "path", "") == "/studio/claims/preview" for route in main.app.routes):
        main.app.include_router(router)
    return client


def _coach(db, as_user, suffix="coach"):
    user = as_user(auth0_sub=f"auth0|claim-{suffix}")
    db.add(StudioAccount(user_id=user.id, role="coach"))
    db.flush()
    return user


def _athlete_user(db, as_user, suffix="athlete"):
    user = as_user(auth0_sub=f"auth0|claim-{suffix}")
    db.add(StudioAccount(user_id=user.id, role="athlete"))
    db.flush()
    return user


def test_claim_preview_accept_preserves_profile_history_and_replays_fail(claim_router, db_session, as_user):
    coach = _coach(db_session, as_user)
    athlete_user = _athlete_user(db_session, as_user)
    profile = Athlete(creator_id=coach.id, name="Ari", sport="basketball", dominant_side="right")
    team = Team(owner_id=coach.id, name="North", sport="basketball", description="")
    db_session.add_all([profile, team]); db_session.flush()
    membership = Membership(team_id=team.id, athlete_id=profile.id, active=True)
    session = TrainingSession(owner_id=coach.id, athlete_id=profile.id, skill_id="basketball.free_throw", status="complete", source={}, metrics={}, analysis={})
    db_session.add_all([membership, session]); db_session.flush()

    import main
    from auth.dependency import current_user
    main.app.dependency_overrides[current_user] = lambda: coach
    response = claim_router.post(f"/studio/athletes/{profile.id}/claim-code")
    assert response.status_code == 201
    code = response.json()["code"]
    main.app.dependency_overrides[current_user] = lambda: athlete_user
    preview = claim_router.post("/studio/claims/preview", json={"code": code})
    assert preview.status_code == 200
    assert preview.json()["athlete"]["name"] == "Ari"
    assert preview.json()["teams"] == [{"id": str(team.id), "name": "North", "coach_id": str(coach.id)}]
    assert "recordings owned by its coach" in preview.json()["sharing_notice"]

    accepted = claim_router.post("/studio/claims/accept", json={"code": code})
    assert accepted.status_code == 200
    assert profile.account_id == athlete_user.id
    assert db_session.get(Membership, membership.id).active
    assert db_session.get(TrainingSession, session.id) is not None
    assert db_session.query(AuditEvent).filter_by(action="athlete.profile_claimed").count() == 1
    assert claim_router.post("/studio/claims/accept", json={"code": code}).status_code == 404


def test_claim_code_owner_role_and_expiry(claim_router, db_session, as_user):
    coach = _coach(db_session, as_user, "owner")
    other = _coach(db_session, as_user, "other")
    profile = Athlete(creator_id=coach.id, name="Ari", sport="basketball")
    db_session.add(profile); db_session.flush()
    import main
    from auth.dependency import current_user
    main.app.dependency_overrides[current_user] = lambda: other
    assert claim_router.post(f"/studio/athletes/{profile.id}/claim-code").status_code == 403
    main.app.dependency_overrides[current_user] = lambda: coach
    code = claim_router.post(f"/studio/athletes/{profile.id}/claim-code").json()["code"]
    claim = db_session.query(AthleteClaim).one()
    claim.expires_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
    db_session.flush()
    athlete_user = _athlete_user(db_session, as_user, "expiry")
    main.app.dependency_overrides[current_user] = lambda: athlete_user
    assert claim_router.post("/studio/claims/preview", json={"code": code}).status_code == 404
    assert claim_router.post("/studio/claims/accept", json={"code": code}).status_code == 404


def test_claim_never_automatically_merges_existing_profile(claim_router, db_session, as_user):
    coach = _coach(db_session, as_user, "merge-coach")
    claimant = _athlete_user(db_session, as_user, "merge-user")
    existing = Athlete(creator_id=claimant.id, account_id=claimant.id, name="Canonical", sport="basketball")
    managed = Athlete(creator_id=coach.id, name="Managed", sport="basketball")
    db_session.add_all([existing, managed]); db_session.flush()
    import main
    from auth.dependency import current_user
    main.app.dependency_overrides[current_user] = lambda: coach
    code = claim_router.post(f"/studio/athletes/{managed.id}/claim-code").json()["code"]
    main.app.dependency_overrides[current_user] = lambda: claimant
    preview = claim_router.post("/studio/claims/preview", json={"code": code})
    assert preview.status_code == 200
    assert preview.json()["claim_blocked"] is True
    assert "profile merge" in preview.json()["claim_block_reason"]
    response = claim_router.post("/studio/claims/accept", json={"code": code})
    assert response.status_code == 409
    assert managed.account_id is None
    assert existing.account_id == claimant.id


def test_claim_accept_requires_athlete_workspace(claim_router, db_session, as_user):
    coach = _coach(db_session, as_user, "role-coach")
    profile = Athlete(creator_id=coach.id, name="Ari", sport="basketball")
    db_session.add(profile); db_session.flush()
    code = claim_router.post(f"/studio/athletes/{profile.id}/claim-code").json()["code"]
    assert claim_router.post("/studio/claims/preview", json={"code": code}).status_code == 403
