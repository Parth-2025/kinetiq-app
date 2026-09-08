from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from analyzer.sports.tennis.scoring import (
    IDEALS,
    PHASE_INFO,
    PHASE_RESOURCES,
    generate_feedback,
    score,
)
from tests.conftest import load_fixture


def _analyze(name):
    m = frame_metrics(load_fixture(name))
    seg = segment(m)
    pm = {}
    for p in PHASE_ORDER:
        idx = seg["phases"].get(p)
        pm[p] = m[idx] if idx is not None and m[idx] is not None else None
    return score(pm)


def test_config_covers_every_phase():
    assert set(IDEALS) == set(PHASE_ORDER)
    assert set(PHASE_INFO) == set(PHASE_ORDER)
    assert set(PHASE_RESOURCES) == set(PHASE_ORDER)
    for phase in PHASE_ORDER:
        assert len(PHASE_RESOURCES[phase]) == 2
        for r in PHASE_RESOURCES[phase]:
            assert set(r) == {"label", "url"}
            assert r["url"].startswith("https://")


def test_score_shape():
    result = _analyze("serve_good")
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) == set(PHASE_ORDER)
    assert result["priority"] in PHASE_ORDER
    for block in result["phases"].values():
        assert set(block) >= {
            "emoji", "title", "description", "score", "status", "feedback",
            "resources", "angles_measured",
        }


def test_good_serve_scores_reasonably():
    assert _analyze("serve_good")["overall_score"] >= 70


def test_shallow_trophy_scores_below_good_at_trophy():
    good = _analyze("serve_good")["phases"]["trophy"]["score"]
    shallow = _analyze("serve_shallow_trophy")["phases"]["trophy"]["score"]
    assert shallow < good


def test_missing_phase_is_unavailable():
    result = score({k: None for k in PHASE_ORDER})
    assert result["overall_score"] == 0
    for block in result["phases"].values():
        assert block["score"] == 0
        assert block["status"] == "unavailable"
        assert block["angles_measured"] == {}


def test_angle_unit_suffix_rules():
    result = _analyze("serve_good")
    measured = result["phases"]["contact"]["angles_measured"]
    assert "hitting_elbow_angle" in measured
    assert measured["hitting_elbow_angle"]["ideal"].endswith("°")
    assert not measured["contact_reach"]["ideal"].endswith("°")


def test_priority_is_lowest_scoring_phase():
    result = _analyze("serve_shallow_trophy")
    lowest = min(result["phases"].items(), key=lambda kv: kv[1]["score"])[0]
    assert result["priority"] == lowest


def test_generate_feedback_returns_status_triple():
    for phase in PHASE_ORDER:
        text, status = generate_feedback(phase, {})
        assert isinstance(text, str) and text
        assert status in {"good", "warning", "error"}
