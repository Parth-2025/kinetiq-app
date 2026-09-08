import numpy as np
import pytest

from analyzer.sports.tennis.metrics import _frame_metrics, frame_metrics
from tests import synth

KEYS = {
    "dominant_side", "hitting_elbow_angle", "tossing_arm_angle", "knee_angle",
    "trunk_tilt", "shoulder_hip_separation", "shoulder_tilt",
    "dominant_arm_elevation", "contact_reach", "toss_reach", "tossing_wrist_y",
    "dominant_wrist_y", "dominant_shoulder_y", "torso_width", "torso_height",
}


def _hand_frame(**overrides):
    """A minimal upright figure facing +x; y grows downward."""
    base = {
        "nose": [0.50, 0.12, 0.0, 1.0],
        "left_shoulder": [0.47, 0.26, 0.0, 1.0],
        "right_shoulder": [0.53, 0.26, 0.0, 1.0],
        "left_elbow": [0.46, 0.40, 0.0, 1.0],
        "right_elbow": [0.54, 0.40, 0.0, 1.0],
        "left_wrist": [0.45, 0.52, 0.0, 1.0],
        "right_wrist": [0.55, 0.52, 0.0, 1.0],
        "left_hip": [0.47, 0.52, 0.0, 1.0],
        "right_hip": [0.53, 0.52, 0.0, 1.0],
        "left_knee": [0.47, 0.70, 0.0, 1.0],
        "right_knee": [0.53, 0.70, 0.0, 1.0],
        "left_ankle": [0.47, 0.88, 0.0, 1.0],
        "right_ankle": [0.53, 0.88, 0.0, 1.0],
    }
    base.update(overrides)
    return {k: np.asarray(v, dtype=float) for k, v in base.items()}


def test_key_set_exact():
    m = _frame_metrics(_hand_frame(), "right")
    assert set(m) == KEYS


def test_straight_arm_up_has_small_elevation():
    # right wrist directly above right shoulder -> elevation ~ 0
    f = _hand_frame(
        right_elbow=[0.53, 0.13, 0.0, 1.0],
        right_wrist=[0.53, 0.00, 0.0, 1.0],
    )
    m = _frame_metrics(f, "right")
    assert m["dominant_arm_elevation"] < 5.0
    assert m["hitting_elbow_angle"] > 170.0


def test_level_shoulders_and_hips_zero_separation_and_tilt():
    m = _frame_metrics(_hand_frame(), "right")
    assert m["shoulder_hip_separation"] < 1.0
    assert m["shoulder_tilt"] < 1e-6
    assert m["trunk_tilt"] < 1.0


def test_dropped_right_shoulder_raises_separation_and_tilt():
    f = _hand_frame(right_shoulder=[0.53, 0.33, 0.0, 1.0])
    m = _frame_metrics(f, "right")
    assert m["shoulder_tilt"] > 0.05
    assert m["shoulder_hip_separation"] > 20.0


def test_contact_reach_negative_when_wrist_above_nose():
    f = _hand_frame(right_wrist=[0.53, 0.02, 0.0, 1.0])
    m = _frame_metrics(f, "right")
    assert m["contact_reach"] == pytest.approx(0.02 - 0.12, abs=1e-6)
    assert m["contact_reach"] < 0


def test_toss_reach_negative_when_tossing_wrist_above_nose():
    # non-dominant (tossing) wrist lifted above the head -> toss_reach < 0
    f = _hand_frame(left_wrist=[0.45, 0.02, 0.0, 1.0])
    m = _frame_metrics(f, "right")
    assert m["toss_reach"] == pytest.approx(0.02 - 0.12, abs=1e-6)
    assert m["toss_reach"] < 0


def test_backward_trunk_lean_increases_trunk_tilt():
    # shoulders shifted -x relative to hips -> torso leans from vertical
    f = _hand_frame(
        left_shoulder=[0.37, 0.27, 0.0, 1.0],
        right_shoulder=[0.43, 0.27, 0.0, 1.0],
    )
    m = _frame_metrics(f, "right")
    assert m["trunk_tilt"] > 15.0


def test_dominant_side_follows_highest_wrist_over_clip():
    right = frame_metrics(synth.make_serve(dominant_side="right"))
    left = frame_metrics(synth.make_serve(dominant_side="left"))
    assert next(x for x in right if x)["dominant_side"] == "right"
    assert next(x for x in left if x)["dominant_side"] == "left"


def test_none_passthrough_and_alignment():
    frames = synth.make_serve(n_frames=12)
    frames[0] = None
    frames[5] = None
    out = frame_metrics(frames)
    assert len(out) == 12
    assert out[0] is None and out[5] is None
    assert all(isinstance(x, dict) for i, x in enumerate(out) if i not in (0, 5))


def test_all_none_clip_returns_all_none():
    out = frame_metrics([None, None, None])
    assert out == [None, None, None]
