"""Per-frame tennis-serve metrics from MediaPipe pose landmarks.

MediaPipe Pose gives body landmarks only — no racket, no ball. The dominant
(racket) wrist is the racket proxy throughout. All angle metrics are degrees;
all ``*_y`` metrics are normalised image coordinates (y grows downward).

Imports: numpy + stdlib + analyzer.geometry only (core-purity constraint).
"""
import math

import numpy as np

from analyzer.geometry import calculate_angle


def _angle_between(u: np.ndarray, v: np.ndarray) -> float:
    """Unsigned angle in degrees between two 2-D vectors, in [0, 180]."""
    nu = float(np.linalg.norm(u))
    nv = float(np.linalg.norm(v))
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    cos = float(np.dot(u, v) / (nu * nv))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def _line_incline(left: np.ndarray, right: np.ndarray) -> float:
    """Inclination in degrees of the left->right segment from the image
    horizontal, in [-90, 90]. Robust to the segment being near-vertical."""
    dx = float(right[0] - left[0])
    dy = float(right[1] - left[1])
    return math.degrees(math.atan2(dy, dx))


def _fold_90(deg: float) -> float:
    """Fold an angle difference into [0, 90]."""
    a = abs(deg) % 180.0
    return a if a <= 90.0 else 180.0 - a


def _frame_metrics(frame: dict, side: str) -> dict:
    opp = "left" if side == "right" else "right"

    d_sh = np.asarray(frame[f"{side}_shoulder"], dtype=float)
    d_el = np.asarray(frame[f"{side}_elbow"], dtype=float)
    d_wr = np.asarray(frame[f"{side}_wrist"], dtype=float)
    n_sh = np.asarray(frame[f"{opp}_shoulder"], dtype=float)
    n_el = np.asarray(frame[f"{opp}_elbow"], dtype=float)
    n_wr = np.asarray(frame[f"{opp}_wrist"], dtype=float)
    l_sh = np.asarray(frame["left_shoulder"], dtype=float)
    r_sh = np.asarray(frame["right_shoulder"], dtype=float)
    l_hip = np.asarray(frame["left_hip"], dtype=float)
    r_hip = np.asarray(frame["right_hip"], dtype=float)
    nose = np.asarray(frame["nose"], dtype=float)

    sh_mid = (l_sh[:2] + r_sh[:2]) / 2.0
    hip_mid = (l_hip[:2] + r_hip[:2]) / 2.0

    knee_l = calculate_angle(
        frame["left_hip"][:3], frame["left_knee"][:3], frame["left_ankle"][:3]
    )
    knee_r = calculate_angle(
        frame["right_hip"][:3], frame["right_knee"][:3], frame["right_ankle"][:3]
    )

    torso_vec = sh_mid - hip_mid           # points up-ish (negative dy)
    trunk_tilt = _angle_between(torso_vec, np.array([0.0, -1.0]))

    arm_vec = d_wr[:2] - d_sh[:2]          # shoulder -> wrist
    dominant_arm_elevation = _angle_between(arm_vec, np.array([0.0, -1.0]))

    sep = _fold_90(_line_incline(l_sh[:2], r_sh[:2]) - _line_incline(l_hip[:2], r_hip[:2]))

    return {
        "dominant_side": side,
        "hitting_elbow_angle": calculate_angle(d_sh[:3], d_el[:3], d_wr[:3]),
        "tossing_arm_angle": calculate_angle(n_sh[:3], n_el[:3], n_wr[:3]),
        "knee_angle": (knee_l + knee_r) / 2.0,
        "trunk_tilt": trunk_tilt,
        "shoulder_hip_separation": sep,
        "shoulder_tilt": abs(float(l_sh[1]) - float(r_sh[1])),
        "dominant_arm_elevation": dominant_arm_elevation,
        "contact_reach": float(d_wr[1]) - float(nose[1]),
        "tossing_wrist_y": float(n_wr[1]),
        "dominant_wrist_y": float(d_wr[1]),
        "dominant_shoulder_y": float(d_sh[1]),
        "torso_width": abs(float(l_sh[0]) - float(r_sh[0])),
        "torso_height": abs(float(hip_mid[1]) - float(sh_mid[1])),
    }


def frame_metrics(frames: list) -> list:
    lw = [float(f["left_wrist"][1]) for f in frames if f is not None]
    rw = [float(f["right_wrist"][1]) for f in frames if f is not None]
    if not lw and not rw:
        return [None] * len(frames)
    side = "right" if min(rw, default=1.0) <= min(lw, default=1.0) else "left"
    return [_frame_metrics(f, side) if f is not None else None for f in frames]
