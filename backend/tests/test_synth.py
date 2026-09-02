import numpy as np
from analyzer.angles import calculate_angle  # created in Task 4; see note below

from tests import synth


def test_all_landmarks_present_and_shaped():
    frames = synth.make_shot(n_frames=30)
    assert len(frames) == 30
    for f in frames:
        assert set(f.keys()) == set(synth.LANDMARK_NAMES)
        for v in f.values():
            assert v.shape == (4,)


def test_shooting_wrist_rises_then_falls():
    frames = synth.make_shot(n_frames=60, shooting_side="right")
    wrist_y = [f["right_wrist"][1] for f in frames]
    lo = int(np.argmin(wrist_y))
    assert 20 < lo < 50  # highest point mid-clip


def test_knee_angle_hits_load_target():
    frames = synth.make_shot(n_frames=60, load_knee_deg=95.0)
    knee = [
        calculate_angle(f["right_hip"][:3], f["right_knee"][:3], f["right_ankle"][:3])
        for f in frames
    ]
    assert min(knee) == min(knee)
    assert abs(min(knee) - 95.0) < 12.0


def test_truncated_is_shorter_and_ends_before_release():
    full = synth.make_shot(n_frames=60)
    cut = synth.make_shot(n_frames=60, truncate_frac=0.62)
    assert len(cut) < len(full)
    assert 30 <= len(cut) <= 42


def test_front_view_has_wide_shoulders():
    side = synth.make_shot(view="side")[0]
    front = synth.make_shot(view="front")[0]
    side_sep = abs(side["left_shoulder"][0] - side["right_shoulder"][0])
    front_sep = abs(front["left_shoulder"][0] - front["right_shoulder"][0])
    assert front_sep > side_sep + 0.1
