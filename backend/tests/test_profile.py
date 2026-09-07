import re

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


def test_get_me_returns_serialized_user(client, as_user):
    u = as_user(email="p@x.com", name="Parth")
    r = client.get("/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(u.id)
    assert body["email"] == "p@x.com"
    assert body["username"] is None
    assert body["active_sport"] is None


def test_patch_profile_sets_name_and_username(client, as_user):
    as_user()
    r = client.patch("/me/profile", json={"name": "New", "username": "Parth_01"})
    assert r.status_code == 200
    assert r.json()["username"] == "parth_01"
    assert r.json()["name"] == "New"


def test_patch_profile_rejects_bad_username(client, as_user):
    as_user()
    r = client.patch("/me/profile", json={"username": "ab"})  # too short
    assert r.status_code == 400


def test_patch_profile_409_on_taken_username(client, as_user, db_session):
    from db.models import User

    other = User(auth0_sub="auth0|other", username="taken")
    db_session.add(other)
    db_session.flush()
    as_user()
    r = client.patch("/me/profile", json={"username": "taken"})
    assert r.status_code == 409


def test_username_available(client, as_user, db_session):
    from db.models import User

    db_session.add(User(auth0_sub="auth0|u", username="claimed"))
    db_session.flush()
    as_user()
    assert client.get("/me/username-available", params={"u": "claimed"}).json() == {
        "available": False
    }
    assert client.get("/me/username-available", params={"u": "free_name"}).json() == {
        "available": True
    }
