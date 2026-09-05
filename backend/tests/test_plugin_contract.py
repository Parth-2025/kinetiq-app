import pytest

from analyzer.registry import SPORTS
from tests.conftest import load_fixture

PLUGINS = list(SPORTS.values())
IDS = [p.name for p in PLUGINS]


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_frame_metrics_returns_aligned_list(plugin):
    frames = load_fixture("good_form_side")
    m = plugin.frame_metrics(frames)
    assert isinstance(m, list)
    assert len(m) == len(frames)
    assert any(isinstance(x, dict) for x in m)
    for row in m:
        assert row is None or isinstance(row, dict)


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_segment_shape(plugin):
    m = plugin.frame_metrics(load_fixture("good_form_side"))
    seg = plugin.segment(m)
    assert set(seg) == {"phases", "camera_view", "confidence"}
    assert set(seg["phases"]) <= set(plugin.phase_order)
    assert isinstance(seg["camera_view"], str)
    assert 0.0 <= seg["confidence"] <= 1.0


@pytest.mark.parametrize("plugin", PLUGINS, ids=IDS)
def test_score_shape(plugin):
    m = plugin.frame_metrics(load_fixture("good_form_side"))
    seg = plugin.segment(m)
    from analyzer.pipeline import _extract_phase_metrics
    pm = _extract_phase_metrics(m, seg["phases"], plugin.phase_order)
    result = plugin.score(pm)
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) <= set(plugin.phase_order)
    assert result["priority"] in plugin.phase_order
