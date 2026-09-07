import pytest

from auth.dependency import _TokenCache
from db.models import User

pytestmark = pytest.mark.skip(reason="needs /me route from Task 4")


class _Resp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeAC:
    """Stand-in for httpx.AsyncClient; returns whatever _FakeAC.response is."""

    response = _Resp(200, {"sub": "auth0|new", "email": "e1@x.com", "name": "N", "picture": "p"})

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, *a, **k):
        return _FakeAC.response


@pytest.fixture(autouse=True)
def _fresh_auth(monkeypatch):
    monkeypatch.setattr("auth.dependency.httpx.AsyncClient", _FakeAC)
    monkeypatch.setattr("auth.dependency._CACHE", _TokenCache())
    monkeypatch.setattr("settings.settings.auth0_domain", "example.us.auth0.com")
    _FakeAC.response = _Resp(
        200, {"sub": "auth0|new", "email": "e1@x.com", "name": "N", "picture": "p"}
    )


def test_missing_bearer_is_401(client):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Token abc"}).status_code == 401


def test_userinfo_non_200_is_401(client):
    _FakeAC.response = _Resp(401, {})
    assert client.get("/me", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_creates_user_on_first_call(client, db_session):
    r = client.get("/me", headers={"Authorization": "Bearer t1"})
    assert r.status_code == 200
    assert db_session.query(User).filter_by(auth0_sub="auth0|new").count() == 1


def test_refreshes_changed_claims(client, db_session):
    client.get("/me", headers={"Authorization": "Bearer t1"})
    _FakeAC.response = _Resp(
        200, {"sub": "auth0|new", "email": "e2@x.com", "name": "N", "picture": "p"}
    )
    client.get("/me", headers={"Authorization": "Bearer t2"})  # new token -> cache miss
    u = db_session.query(User).filter_by(auth0_sub="auth0|new").one()
    assert u.email == "e2@x.com"
