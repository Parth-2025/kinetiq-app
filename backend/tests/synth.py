"""Deterministic synthetic landmark sequences for tests. No video, no MediaPipe.

Coordinates are MediaPipe-style normalized floats in [0, 1], y increasing
downward. Only the joints the analysis core reads are placed with real
geometry; the rest are filled with plausible fixed offsets so serialization
round-trips.
"""
from __future__ import annotations

import numpy as np

LANDMARK_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot", "right_foot",
]

# limb lengths in normalized units
_TORSO = 0.26
_THIGH = 0.20
_SHIN = 0.20
_UPPER_ARM = 0.14
_FOREARM = 0.13


def _lerp_keys(t: float, keys: list[tuple[float, float]]) -> float:
    """Piecewise-linear interpolation. keys sorted by fraction, fractions in [0, 1]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:], strict=False):
        if t <= f1:
            span = f1 - f0
            a = 0.0 if span == 0 else (t - f0) / span
            return v0 + a * (v1 - v0)
    return keys[-1][1]


def _rot(vec: np.ndarray, deg: float) -> np.ndarray:
    r = np.radians(deg)
    c, s = np.cos(r), np.sin(r)
    return np.array([c * vec[0] - s * vec[1], s * vec[0] + c * vec[1]])


def _p(xy: np.ndarray, z: float = 0.0, vis: float = 1.0) -> np.ndarray:
    return np.array([float(xy[0]), float(xy[1]), z, vis], dtype=float)


# time profiles (fraction of clip -> degrees)
_KNEE = [(0.0, 172), (0.15, 168), (0.40, None), (0.68, 176), (1.0, 178)]
_HIP = [(0.0, 165), (0.40, 120), (0.70, 168), (1.0, 172)]
_ARM_ELEV = [(0.0, 12), (0.40, 30), (0.60, 150), (0.68, 170), (1.0, 150)]


def make_shot(
    n_frames: int = 60,
    shooting_side: str = "right",
    view: str = "side",
    load_knee_deg: float = 95.0,
    setpoint_elbow_deg: float = 92.0,
    release_elbow_deg: float = 168.0,
    guide_elbow_deg: float = 80.0,
    shoulder_tilt: float = 0.01,
    truncate_frac: float | None = None,
) -> list[dict]:
    shoulder_sep = 0.05 if view == "side" else 0.26
    knee_keys = [(f, v if v is not None else load_knee_deg) for f, v in _KNEE]
    elbow_keys = [
        (0.0, 58), (0.35, 70),
        (0.55, setpoint_elbow_deg), (0.68, release_elbow_deg), (1.0, 165),
    ]

    frames: list[dict] = []
    total = n_frames if truncate_frac is None else max(6, int(n_frames * truncate_frac))

    for i in range(total):
        t = i / (n_frames - 1)
        knee_a = _lerp_keys(t, knee_keys)
        hip_a = _lerp_keys(t, _HIP)
        arm_elev = _lerp_keys(t, _ARM_ELEV)
        elbow_a = _lerp_keys(t, elbow_keys)

        hip_c = np.array([0.50, 0.52])                       # pelvis center
        up = np.array([0.0, -1.0])

        # legs: knee placed at hip_a from vertical, ankle gives interior knee_a
        knee_dir = _rot(up, hip_a)
        knee = hip_c + _THIGH * knee_dir
        thigh_back = -knee_dir
        ankle = knee + _SHIN * _rot(thigh_back, knee_a)

        # torso straight up
        neck = hip_c + _TORSO * up
        sh_sh = shoulder_sep / 2.0

        # shooting arm: elbow at arm_elev from vertical, wrist gives interior elbow_a
        sh_shoot = neck + np.array([sh_sh if shooting_side == "right" else -sh_sh, 0.0])
        elbow_dir = _rot(up, arm_elev if shooting_side == "right" else -arm_elev)
        elbow_s = sh_shoot + _UPPER_ARM * elbow_dir
        ua_back = -elbow_dir
        wrist_s = elbow_s + _FOREARM * _rot(ua_back, elbow_a if shooting_side == "right" else -elbow_a)

        # guide arm: low, constant guide_elbow_deg
        sh_guide = neck + np.array([-sh_sh if shooting_side == "right" else sh_sh, 0.0])
        g_elbow_dir = _rot(up, -35 if shooting_side == "right" else 35)
        elbow_g = sh_guide + _UPPER_ARM * g_elbow_dir
        wrist_g = elbow_g + _FOREARM * _rot(-g_elbow_dir, guide_elbow_deg)

        left_is_shoot = shooting_side == "left"
        sh_L, sh_R = (sh_shoot, sh_guide) if left_is_shoot else (sh_guide, sh_shoot)
        el_L, el_R = (elbow_s, elbow_g) if left_is_shoot else (elbow_g, elbow_s)
        wr_L, wr_R = (wrist_s, wrist_g) if left_is_shoot else (wrist_g, wrist_s)

        # apply shoulder tilt to the right shoulder only
        sh_R = sh_R + np.array([0.0, shoulder_tilt])

        hip_L = hip_c + np.array([-0.06, 0.0])
        hip_R = hip_c + np.array([0.06, 0.0])
        knee_L = knee + np.array([-0.04, 0.0])
        knee_R = knee + np.array([0.04, 0.0])
        ankle_L = ankle + np.array([-0.04, 0.0])
        ankle_R = ankle + np.array([0.04, 0.0])
        head = neck + np.array([0.0, -0.10])

        frame = {
            "nose": _p(head),
            "left_eye": _p(head + np.array([-0.02, -0.01])),
            "right_eye": _p(head + np.array([0.02, -0.01])),
            "left_ear": _p(head + np.array([-0.04, 0.0])),
            "right_ear": _p(head + np.array([0.04, 0.0])),
            "left_shoulder": _p(sh_L),
            "right_shoulder": _p(sh_R),
            "left_elbow": _p(el_L),
            "right_elbow": _p(el_R),
            "left_wrist": _p(wr_L),
            "right_wrist": _p(wr_R),
            "left_hip": _p(hip_L),
            "right_hip": _p(hip_R),
            "left_knee": _p(knee_L),
            "right_knee": _p(knee_R),
            "left_ankle": _p(ankle_L),
            "right_ankle": _p(ankle_R),
            "left_heel": _p(ankle_L + np.array([-0.01, 0.03])),
            "right_heel": _p(ankle_R + np.array([0.01, 0.03])),
            "left_foot": _p(ankle_L + np.array([-0.05, 0.04])),
            "right_foot": _p(ankle_R + np.array([0.05, 0.04])),
        }
        frames.append(frame)

    return frames


def no_pose(n_frames: int = 40) -> list[None]:
    return [None] * n_frames


SCENARIOS: dict[str, dict] = {
    "good_form_side": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                           release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "shallow_load_side": dict(view="side", load_knee_deg=140.0, setpoint_elbow_deg=92.0,
                              release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "elbow_flare_side": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=125.0,
                             release_elbow_deg=168.0, guide_elbow_deg=125.0, shoulder_tilt=0.02),
    "front_view": dict(view="front", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                       release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01),
    "truncated": dict(view="side", load_knee_deg=95.0, setpoint_elbow_deg=92.0,
                      release_elbow_deg=168.0, guide_elbow_deg=80.0, shoulder_tilt=0.01,
                      truncate_frac=0.62),
}
