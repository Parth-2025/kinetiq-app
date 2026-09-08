"""Serve ideal-frame overlays. Side-profile reference pose per phase in the
app palette, mirroring the basketball ideal frame. cv2/PIL live here only.
"""
import cv2
import numpy as np

from analyzer.skeleton import extract_phase_frame_b64, generate_pose_gif
from analyzer.sports.tennis.phases import PHASE_ORDER

# App palette (BGR).
_BG = (28, 21, 17)          # #11151C
_STRIP = (64, 45, 33)       # #212D40
_STEEL = (125, 107, 90)
_KEY = (83, 104, 214)       # #D66853 terracotta
_INK_TEXT = (245, 240, 235)
_MUTED_TEXT = (170, 155, 140)
_GOOD = (110, 190, 100)

# Side-profile reference pose per phase (normalised x,y; figure faces +x).
# `toss_wrist` is the tossing hand; `wrist` is the hitting hand.
_IDEAL_PROFILE = {
    "stance": {
        "head": (0.50, 0.13), "shoulder": (0.49, 0.26), "elbow": (0.47, 0.40),
        "wrist": (0.49, 0.52), "toss_wrist": (0.45, 0.52), "hip": (0.50, 0.50),
        "knee": (0.51, 0.69), "ankle": (0.50, 0.86), "toe": (0.57, 0.88),
    },
    "toss": {
        "head": (0.49, 0.14), "shoulder": (0.48, 0.27), "elbow": (0.45, 0.38),
        "wrist": (0.44, 0.50), "toss_wrist": (0.55, 0.06), "hip": (0.50, 0.51),
        "knee": (0.52, 0.68), "ankle": (0.50, 0.86), "toe": (0.57, 0.88),
    },
    "trophy": {
        "head": (0.47, 0.16), "shoulder": (0.45, 0.29), "elbow": (0.40, 0.24),
        "wrist": (0.36, 0.14), "toss_wrist": (0.60, 0.10), "hip": (0.51, 0.52),
        "knee": (0.60, 0.64), "ankle": (0.49, 0.85), "toe": (0.57, 0.87),
    },
    "cocking": {
        "head": (0.44, 0.18), "shoulder": (0.43, 0.30), "elbow": (0.36, 0.34),
        "wrist": (0.30, 0.46), "toss_wrist": (0.56, 0.30), "hip": (0.52, 0.52),
        "knee": (0.58, 0.66), "ankle": (0.49, 0.85), "toe": (0.57, 0.87),
    },
    "contact": {
        "head": (0.49, 0.16), "shoulder": (0.49, 0.27), "elbow": (0.51, 0.13),
        "wrist": (0.53, 0.01), "toss_wrist": (0.44, 0.40), "hip": (0.49, 0.51),
        "knee": (0.49, 0.71), "ankle": (0.48, 0.86), "toe": (0.55, 0.89),
    },
    "follow_through": {
        "head": (0.49, 0.17), "shoulder": (0.49, 0.28), "elbow": (0.44, 0.34),
        "wrist": (0.36, 0.52), "toss_wrist": (0.46, 0.44), "hip": (0.50, 0.52),
        "knee": (0.51, 0.71), "ankle": (0.49, 0.87), "toe": (0.56, 0.89),
    },
}
_PROFILE_BONES = [
    ("head", "shoulder"), ("shoulder", "elbow"), ("elbow", "wrist"),
    ("shoulder", "toss_wrist"), ("shoulder", "hip"), ("hip", "knee"),
    ("knee", "ankle"), ("ankle", "toe"),
]
# title, one-line cue, (metric key, label, (lo, hi)), key joints
_IDEAL_PHASE = {
    "stance": ("Stance", "Stand tall - weight balanced",
               ("knee_angle", "Knee", (155, 178)), {"knee", "hip"}),
    "toss": ("Ball Toss", "Straight arm - lift, don't throw",
             ("tossing_arm_angle", "Toss arm", (155, 180)), {"toss_wrist", "shoulder"}),
    "trophy": ("Trophy Pose", "Legs loaded, elbow cocked back",
               ("knee_angle", "Knee", (110, 140)), {"knee", "hip", "elbow"}),
    "cocking": ("Racket Drop", "Tilt back - shoulder over shoulder",
                ("trunk_tilt", "Trunk", (10, 28)), {"shoulder", "hip", "elbow"}),
    "contact": ("Contact", "Full reach - hit at the peak",
                ("hitting_elbow_angle", "Elbow", (150, 180)), {"elbow", "wrist", "shoulder"}),
    "follow_through": ("Follow Through", "Decelerate down and across",
                       ("hitting_elbow_angle", "Elbow", (30, 90)), {"elbow", "wrist"}),
}


def draw_ideal_skeleton(phase: str, metrics: dict, size: tuple[int, int] = (460, 460)) -> np.ndarray:
    w, h = size
    img = np.full((h, w, 3), _BG, dtype=np.uint8)

    pose = _IDEAL_PROFILE.get(phase, _IDEAL_PROFILE["trophy"])
    title, cue, (metric_key, metric_label, (lo, hi)), key = _IDEAL_PHASE.get(
        phase, _IDEAL_PHASE["trophy"]
    )
    px = {name: (int(x * w), int(y * h)) for name, (x, y) in pose.items()}

    floor_y = int(0.90 * h)
    cv2.line(img, (int(0.12 * w), floor_y), (int(0.88 * w), floor_y), _STRIP, 3, cv2.LINE_AA)

    for a, b in _PROFILE_BONES:
        col = _KEY if (a in key and b in key) else _STEEL
        cv2.line(img, px[a], px[b], col, 8, cv2.LINE_AA)
    for name, (x, y) in px.items():
        if name == "head":
            cv2.circle(img, (x, y), 16, _STEEL, 3, cv2.LINE_AA)
            continue
        col = _KEY if name in key else _STEEL
        r = 11 if name in key else 8
        cv2.circle(img, (x, y), r, col, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), r, _BG, 2, cv2.LINE_AA)

    # ball at the tossing hand
    bx0, by0 = px["toss_wrist"]
    cv2.circle(img, (bx0, by0), 13, _INK_TEXT, 2, cv2.LINE_AA)

    cv2.rectangle(img, (0, 0), (w, 40), _STRIP, -1)
    cv2.putText(img, f"IDEAL - {title}", (14, 27),
                cv2.FONT_HERSHEY_DUPLEX, 0.62, _INK_TEXT, 1, cv2.LINE_AA)

    measured = metrics.get(metric_key) if metrics else None
    unit = "" if metric_key == "contact_reach" else "deg"
    bx = w - 176
    cv2.rectangle(img, (bx, 52), (w - 12, 108 if measured is not None else 82), _STRIP, -1)
    cv2.putText(img, f"{metric_label} {lo}-{hi}{unit}", (bx + 12, 74),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _MUTED_TEXT, 1, cv2.LINE_AA)
    if measured is not None:
        ok = lo <= measured <= hi
        cv2.putText(img, f"You {round(measured)}{unit}", (bx + 12, 98),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, _GOOD if ok else _KEY, 1, cv2.LINE_AA)

    cv2.rectangle(img, (0, h - 44), (w, h), _STRIP, -1)
    cv2.putText(img, cue, (14, h - 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.56, _INK_TEXT, 1, cv2.LINE_AA)
    return img


def render_phase_images(frames, metrics, phases, phase_metrics, size=(460, 460)):
    by_index = {i: f for i, f in enumerate(frames)}
    out = {}
    for phase in PHASE_ORDER:
        idx = phases.get(phase)
        frame_data = by_index.get(idx) if idx is not None else None
        angles = phase_metrics.get(phase)
        user_b64, ideal_b64 = extract_phase_frame_b64(
            frame_data, angles, phase, size=size, draw_ideal=draw_ideal_skeleton
        )
        out[phase] = {"user_frame": user_b64, "ideal_frame": ideal_b64}
    return out


def render_all(frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
    return {
        "pose_gif": generate_pose_gif(frames, metrics, label="Your Serve", phase="contact"),
        "phase_images": render_phase_images(frames, metrics, phases, phase_metrics),
    }
