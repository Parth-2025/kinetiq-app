from analyzer.sports.tennis.metrics import frame_metrics
from analyzer.sports.tennis.phases import PHASE_ORDER, segment
from tests.conftest import load_fixture


def _seg(name):
    return segment(frame_metrics(load_fixture(name)))


def test_phase_keys_exact():
    assert set(_seg("serve_good")["phases"]) == set(PHASE_ORDER)


def test_all_six_phases_found_and_ordered_on_good_serve():
    p = _seg("serve_good")["phases"]
    idx = [p[k] for k in PHASE_ORDER]
    assert all(v is not None for v in idx)
    assert idx == sorted(idx)
    assert len(set(idx)) == len(idx)


def test_contact_is_dominant_wrist_peak():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    peak = min(range(len(m)), key=lambda i: m[i]["dominant_wrist_y"])
    assert p["contact"] == peak


def test_toss_is_tossing_wrist_peak_before_contact():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    peak = min((i for i in range(len(m)) if i <= p["contact"]),
               key=lambda i: m[i]["tossing_wrist_y"])
    assert p["toss"] == peak


def test_trophy_is_deepest_knee_between_toss_and_contact():
    m = frame_metrics(load_fixture("serve_good"))
    p = segment(m)["phases"]
    window = [i for i in range(len(m)) if p["toss"] < i < p["contact"]]
    assert p["trophy"] == min(window, key=lambda i: m[i]["knee_angle"])


def test_camera_view_forwarded():
    seg = _seg("serve_good")
    assert seg["camera_view"] in {"side", "oblique", "front"}
    assert 0.0 <= seg["confidence"] <= 1.0


def test_too_few_valid_frames_all_none():
    m = frame_metrics(load_fixture("serve_no_pose"))
    p = segment(m)["phases"]
    assert all(v is None for v in p.values())


def test_truncated_serve_has_no_late_phases():
    p = _seg("serve_truncated")["phases"]
    assert p["stance"] is not None
    assert p["toss"] is not None
    assert p["trophy"] is not None
    assert p["cocking"] is None
    assert p["contact"] is None
    assert p["follow_through"] is None


def test_none_metrics_do_not_break_segmentation():
    m = frame_metrics(load_fixture("serve_good"))
    m[0] = None
    m[-1] = None
    p = segment(m)["phases"]
    assert set(p) == set(PHASE_ORDER)
