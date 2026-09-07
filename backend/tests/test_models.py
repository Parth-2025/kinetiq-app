import uuid

from db.models import AnalysisSession, User, UserSport


def test_user_round_trip(db_session):
    u = User(auth0_sub="auth0|abc", email="a@b.com", name="A")
    db_session.add(u)
    db_session.flush()
    assert isinstance(u.id, uuid.UUID)
    assert u.created_at is not None
    assert u.sports == []


def test_user_sports_and_cascade(db_session):
    u = User(auth0_sub="auth0|s")
    u.sports.append(UserSport(sport="basketball"))
    db_session.add(u)
    db_session.flush()
    assert [s.sport for s in u.sports] == ["basketball"]
    db_session.delete(u)
    db_session.flush()
    assert db_session.query(UserSport).count() == 0


def test_session_and_active_pointer(db_session):
    u = User(auth0_sub="auth0|sess")
    db_session.add(u)
    db_session.flush()
    s = AnalysisSession(
        user_id=u.id, sport="basketball", overall_score=88.5,
        source={"uri": "x"}, analysis={"overall_score": 88.5, "phases": {}},
    )
    db_session.add(s)
    db_session.flush()
    u.active_session_id = s.id
    db_session.flush()
    assert u.active_session_id == s.id
    # deleting the session nulls the pointer (SET NULL)
    db_session.delete(s)
    db_session.flush()
    db_session.refresh(u)
    assert u.active_session_id is None
