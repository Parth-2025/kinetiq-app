from analyzer.angles import angles_per_frame
from analyzer.phases import (
    PHASE_KEYS,
    classify_camera_view,
    extract_phase_angles,
    segment_phases,
)

from tests import synth
from tests.conftest import load_fixture


def _seg(name):
    return segment_phases(angles_per_frame(load_fixture(name)))


def test_phase_keys_present():
    out = _seg("good_form_side")
    assert set(out["phases"]) == set(PHASE_KEYS)


def test_phase_ordering_good_form():
    p = _seg("good_form_side")["phases"]
    idx = [p[k] for k in PHASE_KEYS]
    assert all(v is not None for v in idx)
    assert idx == sorted(idx)


def test_load_is_deepest_knee_bend():
    frames = angles_per_frame(load_fixture("good_form_side"))
    p = segment_phases(frames)["phases"]
    knees = [(i, a["knee_angle"]) for i, a in enumerate(frames) if a]
    true_min_i = min(knees, key=lambda x: x[1])[0]
    assert abs(p["load"] - true_min_i) <= 1


def test_truncated_clip_has_no_release_or_follow_through():
    p = _seg("truncated")["phases"]
    assert p["set_point"] is not None
    assert p["release"] is None or p["follow_through"] is None


def test_degenerate_short_clip_all_none():
    out = segment_phases(angles_per_frame(synth.make_shot(n_frames=4)))
    assert all(v is None for v in out["phases"].values())


def test_camera_view_side_vs_front():
    side_view, side_conf = classify_camera_view(angles_per_frame(load_fixture("good_form_side")))
    front_view, front_conf = classify_camera_view(angles_per_frame(load_fixture("front_view")))
    assert side_view == "side"
    assert front_view == "front"
    assert side_conf > front_conf


def test_segment_reports_low_confidence_for_front_view():
    out = _seg("front_view")
    assert out["camera_view"] == "front"
    assert out["confidence"] <= 0.4


def test_no_pose_returns_all_none_and_oblique():
    out = segment_phases(angles_per_frame(load_fixture("no_pose")))
    assert all(v is None for v in out["phases"].values())
    assert out["camera_view"] == "oblique"


def test_extract_phase_angles_shape():
    frames = angles_per_frame(load_fixture("good_form_side"))
    seg = segment_phases(frames)
    pa = extract_phase_angles(frames, seg["phases"])
    assert set(pa) == set(PHASE_KEYS)
    assert pa["set_point"] is not None
