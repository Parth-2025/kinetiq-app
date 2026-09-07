from analyzer.camera import classify_camera_view
from analyzer.sports.basketball import BasketballPlugin
from analyzer.sports.basketball.phases import PHASE_ORDER, segment
from tests import synth
from tests.conftest import load_fixture

_PLUGIN = BasketballPlugin()


def _metrics(name):
    return _PLUGIN.frame_metrics(load_fixture(name))


def _phase_metrics(metrics, phases):
    out = {}
    for p in PHASE_ORDER:
        idx = phases.get(p)
        out[p] = metrics[idx] if idx is not None and metrics[idx] is not None else None
    return out


def _seg(name):
    return segment(_metrics(name))


def test_phase_keys_present():
    out = _seg("good_form_side")
    assert set(out["phases"]) == set(PHASE_ORDER)


def test_phase_ordering_good_form():
    p = _seg("good_form_side")["phases"]
    idx = [p[k] for k in PHASE_ORDER]
    assert all(v is not None for v in idx)
    assert idx == sorted(idx)


def test_load_is_deepest_knee_bend():
    frames = _metrics("good_form_side")
    p = segment(frames)["phases"]
    knees = [(i, a["knee_angle"]) for i, a in enumerate(frames) if a]
    true_min_i = min(knees, key=lambda x: x[1])[0]
    assert abs(p["load"] - true_min_i) <= 1


def test_truncated_clip_has_no_release_or_follow_through():
    p = _seg("truncated")["phases"]
    assert p["set_point"] is not None
    assert p["release"] is None or p["follow_through"] is None


def test_degenerate_short_clip_all_none():
    out = segment(_PLUGIN.frame_metrics(synth.make_shot(n_frames=4)))
    assert all(v is None for v in out["phases"].values())


def test_camera_view_side_vs_front():
    side_view, side_conf = classify_camera_view(_metrics("good_form_side"))
    front_view, front_conf = classify_camera_view(_metrics("front_view"))
    assert side_view == "side"
    assert front_view == "front"
    assert side_conf > front_conf


def test_segment_reports_low_confidence_for_front_view():
    out = _seg("front_view")
    assert out["camera_view"] == "front"
    assert out["confidence"] <= 0.4


def test_no_pose_returns_all_none_and_oblique():
    out = segment(_metrics("no_pose"))
    assert all(v is None for v in out["phases"].values())
    assert out["camera_view"] == "oblique"


def test_release_taken_on_shooting_arm_not_guide_flip():
    """elbow_flare_side holds the guide arm at ~125 deg. Release must be detected
    on the shooting (right) arm mid-extension, never frozen on the guide constant."""
    al = _metrics("elbow_flare_side")
    seg = segment(al)
    pa = _phase_metrics(al, seg["phases"])
    assert pa["release"] is not None
    assert pa["release"]["shooting_side"] == "right"
    # arm is extending: release elbow angle exceeds the set-point elbow angle
    assert pa["release"]["elbow_angle"] > pa["set_point"]["elbow_angle"]


def test_extract_phase_angles_shape():
    frames = _metrics("good_form_side")
    seg = segment(frames)
    pa = _phase_metrics(frames, seg["phases"])
    assert set(pa) == set(PHASE_ORDER)
    assert pa["set_point"] is not None
