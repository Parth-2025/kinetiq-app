from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth.dependency import current_user
from db.models import AnalysisSession, User, UserSport
from db.session import get_db
from studio.data_routes import router
from studio.models import Athlete, Membership, Measurement, SessionShare, Team, TrainingSession


def test_export_is_authenticated_and_excludes_unshared_teammate_sessions(db_session):
    app = FastAPI()
    app.include_router(router)
    user = User(auth0_sub="auth0|export", name="Export Owner", email="owner@example.test")
    teammate = User(auth0_sub="auth0|teammate", name="Teammate")
    db_session.add_all([user, teammate])
    db_session.flush()
    own = Athlete(creator_id=user.id, account_id=user.id, name="Owner", sport="basketball")
    other = Athlete(creator_id=teammate.id, account_id=teammate.id, name="Teammate", sport="basketball")
    db_session.add_all([own, other])
    db_session.flush()
    team = Team(owner_id=user.id, name="My team", sport="basketball", description="")
    db_session.add(team)
    db_session.flush()
    db_session.add(Membership(team_id=team.id, athlete_id=other.id, active=True))
    db_session.add(Measurement(athlete_id=own.id, actor_id=user.id, values={"height_cm": 180}))
    visible = TrainingSession(owner_id=teammate.id, athlete_id=other.id, skill_id="basketball.free-throw",
                              status="ready", source={}, metrics={"score": 8}, analysis={"movement": "shared"})
    private = TrainingSession(owner_id=teammate.id, athlete_id=other.id, skill_id="basketball.free-throw",
                              status="ready", source={}, metrics={"secret": True}, analysis={"private": True})
    db_session.add_all([visible, private])
    db_session.flush()
    db_session.add(SessionShare(session_id=visible.id, team_id=team.id))
    legacy = AnalysisSession(user_id=user.id, sport="basketball", source={"uri": "clip", "storage_path": "/server/private/clip"}, analysis={"score": 91})
    db_session.add_all([legacy, UserSport(user_id=user.id, sport="basketball")])
    db_session.flush()

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as client:
        assert client.get("/studio/data-export").status_code == 401

    app.dependency_overrides[current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as client:
        result = client.get("/studio/data-export")
        assert result.status_code == 200
        payload = result.json()
        assert payload["account"]["profile"]["email"] == "owner@example.test"
        assert payload["personal"]["measurements"][0]["values"]["height_cm"] == 180
        assert len(payload["personal"]["analysis_sessions"]) == 1
        assert "storage_path" not in payload["personal"]["analysis_sessions"][0]["source"]
        assert [s["id"] for s in payload["shared_sessions"]] == [str(visible.id)]
        assert "private" not in str(payload)



def test_export_respects_claims_archives_and_share_scope(db_session):
    from studio.data_routes import export_data
    from studio.models import Assignment
    from studio.coaching_models import AssignmentCompletion
    user = User(auth0_sub="auth0|boundary-owner", name="Owner")
    other = User(auth0_sub="auth0|boundary-other", name="Other")
    db_session.add_all([user, other]); db_session.flush()
    own = Athlete(creator_id=other.id, account_id=user.id, name="Self")
    claimed = Athlete(creator_id=user.id, account_id=other.id, name="Claimed secret")
    managed = Athlete(creator_id=user.id, name="Managed")
    archived_member = Athlete(creator_id=other.id, name="Archived secret")
    shared_subject = Athlete(creator_id=other.id, name="Shared")
    db_session.add_all([own, claimed, managed, archived_member, shared_subject]); db_session.flush()
    live = Team(owner_id=user.id, name="Live")
    archived = Team(owner_id=user.id, name="Archived", archived=True)
    foreign = Team(owner_id=other.id, name="Foreign")
    db_session.add_all([live, archived, foreign]); db_session.flush()
    db_session.add_all([
        Membership(team_id=archived.id, athlete_id=archived_member.id),
        Membership(team_id=live.id, athlete_id=shared_subject.id),
        Measurement(athlete_id=managed.id, actor_id=user.id, values={"height_cm": 170}),
        Measurement(athlete_id=claimed.id, actor_id=other.id, values={"secret": True}),
    ])
    personal = TrainingSession(owner_id=other.id, athlete_id=own.id, skill_id="basketball.free-throw", status="ready")
    shared = TrainingSession(owner_id=other.id, athlete_id=shared_subject.id, skill_id="basketball.free-throw", status="ready")
    db_session.add_all([personal, shared]); db_session.flush()
    db_session.add_all([SessionShare(session_id=shared.id, team_id=live.id), SessionShare(session_id=shared.id, team_id=foreign.id)])
    assignment = Assignment(owner_id=user.id, athlete_id=managed.id, title="Read", skill_id="written")
    db_session.add(assignment); db_session.flush()
    completion = AssignmentCompletion(assignment_id=assignment.id, athlete_id=managed.id, completed=True)
    db_session.add(completion); db_session.flush()
    payload = export_data(user, db_session)
    assert [s["id"] for s in payload["personal"]["studio_sessions"]] == [personal.id]
    assert {a["id"] for a in payload["owned_teams"]["athletes"]} == {own.id, managed.id, shared_subject.id}
    assert [t["id"] for t in payload["owned_teams"]["teams"]] == [live.id]
    assert [m["athlete_id"] for m in payload["personal"]["measurements"]] == [managed.id]
    assert [share["team_id"] for share in payload["session_shares"]] == [live.id]
    assert payload["assignment_completions"][0]["id"] == completion.id
