import numpy as np

from analyzer.sports.basketball import BasketballPlugin
from tests.conftest import load_fixture


def _extract(metrics, phases, order):
    out = {}
    for p in order:
        idx = phases.get(p)
        out[p] = metrics[idx] if idx is not None and metrics[idx] is not None else None
    return out


def test_identity_attributes():
    p = BasketballPlugin()
    assert p.name == "basketball"
    assert p.display_name == "Basketball"
    assert p.motion == "jump shot"
    assert p.phase_order == ["ready_position", "load", "set_point", "release", "follow_through"]


def test_frame_metrics_whole_clip_none_passthrough():
    p = BasketballPlugin()
    frames = load_fixture("truncated")
    m = p.frame_metrics(frames)
    assert len(m) == len(frames)
    assert any(isinstance(x, dict) for x in m)


def test_segment_then_score_shape():
    p = BasketballPlugin()
    m = p.frame_metrics(load_fixture("good_form_side"))
    seg = p.segment(m)
    assert set(seg["phases"]) == set(p.phase_order)
    assert seg["camera_view"] == "side"
    result = p.score(_extract(m, seg["phases"], p.phase_order))
    assert set(result) == {"overall_score", "priority", "phases"}
    assert set(result["phases"]) == set(p.phase_order)


def test_render_default_not_used_basketball_returns_image_dict():
    p = BasketballPlugin()
    frames = load_fixture("good_form_side")
    # synth fixtures carry no real _frame/_raw_landmarks -> user frames are "",
    # ideal frames are still drawn
    for f in frames:
        if f is not None:
            f["_frame"] = np.zeros((100, 100, 3), dtype=np.uint8)
            f["_raw_landmarks"] = None
    m = p.frame_metrics(frames)
    seg = p.segment(m)
    rendered = p.render(frames, m, seg["phases"], _extract(m, seg["phases"], p.phase_order))
    assert set(rendered) == {"pose_gif", "phase_images"}
    assert set(rendered["phase_images"]) == set(p.phase_order)
    for pair in rendered["phase_images"].values():
        assert set(pair) == {"user_frame", "ideal_frame"}
