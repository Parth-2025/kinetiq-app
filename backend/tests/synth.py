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
        wrist_g = elbow_g + _FOREARM * _rot(
            -g_elbow_dir, guide_elbow_deg if shooting_side == "right" else -guide_elbow_deg
        )

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


# --- tennis serve ---------------------------------------------------------

# fraction of clip -> degrees / normalised units
_SRV_KNEE = [(0.0, 173), (0.12, 171), (0.42, None), (0.60, 150), (0.70, 176), (1.0, 178)]
_SRV_TRUNK_TILT = [(0.0, 2), (0.12, 3), (0.42, 11), (0.55, 22), (0.70, 6), (1.0, 4)]
_SRV_HIT_ELBOW = [(0.0, 150), (0.30, 122), (0.42, 100), (0.55, 96),
                  (0.70, 179), (0.85, 62), (1.0, 55)]
_SRV_HIT_ARM_ELEV = [(0.0, 168), (0.30, 112), (0.42, 96), (0.55, 82),
                     (0.70, 2), (0.85, 108), (1.0, 128)]
_SRV_TOSS_ARM_ELEV = [(0.0, 168), (0.14, 92), (0.30, 16), (0.46, 62),
                      (0.66, 150), (1.0, 165)]
_SRV_TOSS_ELBOW = [(0.0, 158), (0.30, 172), (0.60, 150), (1.0, 148)]
_SRV_SH_DROP = [(0.0, 0.005), (0.42, 0.09), (0.55, 0.11), (0.70, 0.0), (1.0, 0.01)]


def make_serve(
    n_frames: int = 48,
    dominant_side: str = "right",
    view: str = "side",
    trophy_knee_deg: float = 124.0,
    truncate_frac: float | None = None,
) -> list[dict]:
    """Deterministic side-view tennis serve. Figure faces +x; the dominant
    arm is on the +x side. Sweeps stance -> toss -> trophy -> cocking ->
    contact -> follow_through in temporal order."""
    knee_keys = [(f, v if v is not None else trophy_knee_deg) for f, v in _SRV_KNEE]
    shoulder_sep = 0.06 if view == "side" else 0.24
    sign = 1.0 if dominant_side == "right" else -1.0
    up = np.array([0.0, -1.0])
    total = n_frames if truncate_frac is None else max(6, int(n_frames * truncate_frac))
    frames: list[dict] = []

    for i in range(total):
        t = i / (n_frames - 1)
        knee_a = _lerp_keys(t, knee_keys)
        trunk = _lerp_keys(t, _SRV_TRUNK_TILT)
        hit_elbow = _lerp_keys(t, _SRV_HIT_ELBOW)
        hit_elev = _lerp_keys(t, _SRV_HIT_ARM_ELEV)
        toss_elev = _lerp_keys(t, _SRV_TOSS_ARM_ELEV)
        toss_elbow = _lerp_keys(t, _SRV_TOSS_ELBOW)
        sh_drop = _lerp_keys(t, _SRV_SH_DROP)

        hip_c = np.array([0.50, 0.52])
        # torso leans backward (toward -x for a right-hander) by `trunk` degrees
        neck = hip_c + _TORSO * _rot(up, -sign * trunk)
        sh_off = np.array([sign * shoulder_sep / 2.0, 0.0])
        sh_dom = neck + sh_off
        sh_non = neck - sh_off
        # drop the dominant shoulder during the trophy/cocking window
        sh_dom = sh_dom + np.array([0.0, sh_drop])

        # dominant arm: elbow at `hit_elev` from straight-up (rotated toward +x),
        # wrist bends to interior `hit_elbow`
        elbow_dir = _rot(up, sign * hit_elev)
        el_dom = sh_dom + _UPPER_ARM * elbow_dir
        wr_dom = el_dom + _FOREARM * _rot(-elbow_dir, sign * hit_elbow)

        # tossing arm: elbow at `toss_elev` from straight-up (toward -x),
        # near-straight interior `toss_elbow`
        toss_dir = _rot(up, -sign * toss_elev)
        el_non = sh_non + _UPPER_ARM * toss_dir
        wr_non = el_non + _FOREARM * _rot(-toss_dir, -sign * toss_elbow)

        # legs: symmetric, knee placed slightly forward, ankle gives interior knee_a
        knee_dir = _rot(up, 6.0)
        knee_pt = hip_c + _THIGH * knee_dir
        ankle_pt = knee_pt + _SHIN * _rot(-knee_dir, knee_a)

        head = neck + np.array([0.0, -0.10])
        hip_L = hip_c + np.array([-0.055, 0.0])
        hip_R = hip_c + np.array([0.055, 0.0])
        knee_L = knee_pt + np.array([-0.035, 0.0])
        knee_R = knee_pt + np.array([0.035, 0.0])
        ank_L = ankle_pt + np.array([-0.035, 0.0])
        ank_R = ankle_pt + np.array([0.035, 0.0])

        dom_is_left = dominant_side == "left"
        sh_L, sh_R = (sh_dom, sh_non) if dom_is_left else (sh_non, sh_dom)
        el_L, el_R = (el_dom, el_non) if dom_is_left else (el_non, el_dom)
        wr_L, wr_R = (wr_dom, wr_non) if dom_is_left else (wr_non, wr_dom)

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
            "left_ankle": _p(ank_L),
            "right_ankle": _p(ank_R),
            "left_heel": _p(ank_L + np.array([-0.01, 0.03])),
            "right_heel": _p(ank_R + np.array([0.01, 0.03])),
            "left_foot": _p(ank_L + np.array([-0.05, 0.04])),
            "right_foot": _p(ank_R + np.array([0.05, 0.04])),
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
                      truncate_frac=0.45),
}


SERVE_SCENARIOS: dict[str, dict] = {
    "serve_good": dict(view="side", trophy_knee_deg=124.0),
    "serve_shallow_trophy": dict(view="side", trophy_knee_deg=165.0),
    "serve_truncated": dict(view="side", trophy_knee_deg=124.0, truncate_frac=0.45),
}
