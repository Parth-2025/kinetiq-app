from analyzer.scoring_curve import score_metric
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.phases import PHASE_ORDER
from analyzer.sports.basketball.scoring import IDEALS, PHASE_INFO, score
from tests.conftest import load_fixture

_PLUGIN = BasketballPlugin()


def _analyze(name):
    m = _PLUGIN.frame_metrics(load_fixture(name))
    seg = _PLUGIN.segment(m)
    phase_metrics = {}
    for p in PHASE_ORDER:
        idx = seg["phases"].get(p)
        phase_metrics[p] = m[idx] if idx is not None and m[idx] is not None else None
    return score(phase_metrics)


def test_score_metric_inside_band_is_100():
    assert score_metric(95.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(85.0, 85.0, 100.0, 30.0) == 100.0
    assert score_metric(100.0, 85.0, 100.0, 30.0) == 100.0


def test_score_metric_linear_falloff():
    assert score_metric(115.0, 85.0, 100.0, 30.0) == 50.0   # 15 past hi, half a falloff
    assert score_metric(70.0, 85.0, 100.0, 30.0) == 50.0    # 15 below lo
    assert score_metric(55.0, 85.0, 100.0, 30.0) == 0.0     # 30 past = floor
    assert score_metric(40.0, 85.0, 100.0, 30.0) == 0.0     # clamped, never negative


def test_tilt_metric_penalised_unlike_legacy():
    # legacy /30.0 curve gave ~99.8 here; the tighter falloff gives 50
    assert score_metric(0.08, 0.0, 0.04, 0.08) == 50.0


def test_ideals_has_ready_position():
    assert "ready_position" in IDEALS
    assert "knee_angle" in IDEALS["ready_position"]


def test_analyze_shape_matches_legacy_contract():
    result = _analyze("good_form_side")
    assert set(result) == {"overall_score", "priority", "phases"}
    for phase, block in result["phases"].items():
        assert phase in PHASE_INFO
        assert set(block) >= {
            "emoji", "title", "description", "score", "status", "feedback",
            "resources", "angles_measured",
        }


def test_good_form_scores_higher_than_shallow_load():
    good = _analyze("good_form_side")
    shallow = _analyze("shallow_load_side")
    assert good["phases"]["load"]["score"] > shallow["phases"]["load"]["score"]


def test_priority_is_lowest_scoring_phase():
    result = _analyze("shallow_load_side")
    lowest = min(result["phases"].items(), key=lambda kv: kv[1]["score"])[0]
    assert result["priority"] == lowest


def test_missing_phase_scores_zero_unavailable():
    result = score({k: None for k in PHASE_INFO})
    assert result["overall_score"] == 0
    for block in result["phases"].values():
        assert block["score"] == 0
        assert block["status"] == "unavailable"
