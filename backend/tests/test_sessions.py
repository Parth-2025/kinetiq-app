def _analysis(score=90.0):
    return {"overall_score": score, "priority": "release", "phases": {}, "pose_gif": "x" * 50}


def test_create_sets_active_and_extracts_score(client, as_user, db_session):
    u = as_user()
    r = client.post("/me/sessions", json={
        "sport": "basketball", "source": {"uri": "f.mp4"}, "analysis": _analysis(87.4),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["sport"] == "basketball"
    assert float(body["overall_score"]) == 87.4
    db_session.refresh(u)
    assert str(u.active_session_id) == body["id"]


def test_list_omits_blobs_and_honours_limit(client, as_user):
    as_user()
    for i in range(3):
        client.post("/me/sessions", json={
            "sport": "basketball", "source": {}, "analysis": _analysis(float(i)),
        })
    rows = client.get("/me/sessions", params={"limit": 2}).json()
    assert len(rows) == 2
    assert set(rows[0]) == {"id", "sport", "overall_score", "created_at"}
    # newest first
    assert float(rows[0]["overall_score"]) == 2.0


def test_get_by_id_returns_blob_and_404_across_users(client, as_user, db_session):
    as_user(auth0_sub="auth0|a")
    made = client.post("/me/sessions", json={
        "sport": "basketball", "source": {"uri": "z"}, "analysis": _analysis(),
    }).json()
    full = client.get(f"/me/sessions/{made['id']}").json()
    assert full["analysis"]["pose_gif"] == "x" * 50
    assert full["source"]["uri"] == "z"

    # different user cannot see it
    as_user(auth0_sub="auth0|b")
    assert client.get(f"/me/sessions/{made['id']}").status_code == 404


def test_active_session_endpoint(client, as_user):
    as_user()
    assert client.get("/me/sessions/active").json() is None
    made = client.post("/me/sessions", json={
        "sport": "basketball", "source": {}, "analysis": _analysis(75.0),
    }).json()
    active = client.get("/me/sessions/active").json()
    assert active["id"] == made["id"]
    assert "analysis" in active


def test_create_rejects_non_object_blob(client, as_user):
    as_user()
    r = client.post("/me/sessions", json={"sport": "basketball", "source": [], "analysis": {}})
    assert r.status_code == 422 or r.status_code == 400
