import types

import numpy as np

from analyzer.skeleton import draw_skeleton_on_frame
from analyzer.sports.basketball.rendering import IDEAL_RANGES


def _stub_landmarks():
    """33 MediaPipe-style landmarks, each with .x/.y floats in [0, 1]."""
    lm = [types.SimpleNamespace(x=0.5, y=0.5) for _ in range(33)]
    # nudge a handful so bones are not all degenerate points
    lm[0] = types.SimpleNamespace(x=0.50, y=0.15)   # nose
    lm[11] = types.SimpleNamespace(x=0.42, y=0.30)  # left_shoulder
    lm[12] = types.SimpleNamespace(x=0.58, y=0.30)  # right_shoulder
    lm[13] = types.SimpleNamespace(x=0.40, y=0.45)  # left_elbow
    lm[14] = types.SimpleNamespace(x=0.60, y=0.45)  # right_elbow
    lm[15] = types.SimpleNamespace(x=0.38, y=0.60)  # left_wrist
    lm[16] = types.SimpleNamespace(x=0.62, y=0.60)  # right_wrist
    lm[23] = types.SimpleNamespace(x=0.45, y=0.58)  # left_hip
    lm[24] = types.SimpleNamespace(x=0.55, y=0.58)  # right_hip
    lm[25] = types.SimpleNamespace(x=0.45, y=0.75)  # left_knee
    lm[26] = types.SimpleNamespace(x=0.55, y=0.75)  # right_knee
    lm[27] = types.SimpleNamespace(x=0.45, y=0.90)  # left_ankle
    lm[28] = types.SimpleNamespace(x=0.55, y=0.90)  # right_ankle
    return lm


_ANGLES = {
    "shooting_side": "right",
    "knee_angle": 95,
    "elbow_angle": 90,
    "guide_elbow_angle": 80,
}


def test_returns_ndarray_of_expected_shape():
    frame = np.zeros((400, 400, 3), np.uint8)
    size = (400, 400)
    out = draw_skeleton_on_frame(
        frame, _stub_landmarks(), _ANGLES, "load", size=size, ideal_ranges=IDEAL_RANGES
    )
    assert isinstance(out, np.ndarray)
    assert out.shape == (size[1], size[0], 3)


def test_ideal_ranges_change_joint_colouring():
    frame = np.zeros((400, 400, 3), np.uint8)
    lm = _stub_landmarks()
    with_ranges = draw_skeleton_on_frame(
        frame, lm, _ANGLES, "load", ideal_ranges=IDEAL_RANGES
    )
    without_ranges = draw_skeleton_on_frame(
        frame, lm, _ANGLES, "load", ideal_ranges=None
    )
    assert not np.array_equal(with_ranges, without_ranges)
