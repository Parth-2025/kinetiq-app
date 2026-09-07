def _sports(client):
    return client.get("/me/sports").json()


def test_empty_sports(client, as_user):
    as_user()
    assert _sports(client) == {"active": None, "selected": []}


def test_first_add_activates(client, as_user):
    as_user()
    r = client.post("/me/sports/selected", json={"sport": "basketball"})
    assert r.status_code == 200
    assert r.json() == {"active": "basketball", "selected": ["basketball"]}


def test_second_add_does_not_change_active_and_sorts(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "tennis"})
    body = client.post("/me/sports/selected", json={"sport": "basketball"}).json()
    assert body == {"active": "tennis", "selected": ["basketball", "tennis"]}


def test_activate_must_be_selected(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "basketball"})
    assert client.put("/me/sports/active", json={"sport": "running"}).status_code == 400
    assert client.put("/me/sports/active", json={"sport": "basketball"}).status_code == 200


def test_delete_active_reassigns(client, as_user):
    as_user()
    client.post("/me/sports/selected", json={"sport": "tennis"})
    client.post("/me/sports/selected", json={"sport": "basketball"})
    client.put("/me/sports/active", json={"sport": "tennis"})
    body = client.delete("/me/sports/selected/tennis").json()
    assert body == {"active": "basketball", "selected": ["basketball"]}
    body = client.delete("/me/sports/selected/basketball").json()
    assert body == {"active": None, "selected": []}
