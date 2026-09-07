import pytest

from routers.stats import calculate_level_progress, get_total_exp_required_for_level


@pytest.mark.parametrize(
    "level,total",
    [(0, 0), (1, 50), (2, 150), (3, 300), (4, 500)],
)
def test_total_exp_curve(level, total):
    assert get_total_exp_required_for_level(level) == total


@pytest.mark.parametrize(
    "exp,level,pct",
    [(0, 0, 0), (50, 1, 0), (100, 1, 50), (149, 1, 99), (150, 2, 0)],
)
def test_level_progress_table(exp, level, pct):
    p = calculate_level_progress(exp)
    assert p["level"] == level
    assert p["progressPct"] == pct


def test_stats_zero_when_no_sessions(client, as_user):
    as_user()
    s = client.get("/me/stats").json()
    assert s["shotsAnalyzed"] == 0
    assert s["avgScore"] == 0
    assert s["bestScore"] == 0
    assert s["level"] == 0


def test_stats_aggregate(client, as_user):
    as_user()
    for score in (60.0, 90.0, 30.0):
        client.post("/me/sessions", json={
            "sport": "basketball", "source": {},
            "analysis": {"overall_score": score, "phases": {}},
        })
    s = client.get("/me/stats").json()
    assert s["shotsAnalyzed"] == 3
    assert s["videosUploaded"] == 3
    assert s["totalScore"] == 180
    assert s["avgScore"] == 60.0
    assert s["bestScore"] == 90
    assert s["latestScore"] == 30
    assert s["exp"] == 150
    assert s["level"] == 2


def test_stats_filtered_by_sport(client, as_user):
    as_user()
    client.post("/me/sessions", json={"sport": "basketball", "source": {},
                                      "analysis": {"overall_score": 80.0, "phases": {}}})
    client.post("/me/sessions", json={"sport": "tennis", "source": {},
                                      "analysis": {"overall_score": 20.0, "phases": {}}})
    assert client.get("/me/stats", params={"sport": "basketball"}).json()["shotsAnalyzed"] == 1
