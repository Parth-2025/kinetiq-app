"""All skeleton / GIF drawing, isolated from analysis.

Drawing code (constants + functions) copied verbatim from the legacy
``analyzer/pose_detector.py``; only typing-annotation modernisation and
``zip(..., strict=...)`` were applied to satisfy ruff (behaviour unchanged).
"""

import base64
import io

import cv2
import numpy as np
from PIL import Image

from analyzer.geometry import LANDMARKS
from analyzer.skeleton import SKELETON_CONNECTIONS, get_joint_color

IDEAL_RANGES = {
    "load":          {"knee": (80, 110),   "elbow": (80, 110),  "hip": (100, 140)},
    "set_point":     {"elbow": (85, 100),  "guide_elbow": (60, 100), "knee": (100, 150)},
    "release":       {"elbow": (155, 175), "knee": (160, 180),  "shoulder_tilt": (0, 0.05)},
    "follow_through":{"elbow": (155, 180), "wrist_drop": (0.05, 0.3)},
}


def draw_skeleton_on_frame(
    frame: np.ndarray,
    landmarks: list,
    angles: dict,
    phase: str,
    size: tuple[int, int] = (400, 400),
) -> np.ndarray:
    h, w = frame.shape[:2]
    img = frame.copy()
    side = angles.get("shooting_side", "right")
    phase_ideal = IDEAL_RANGES.get(phase, {})
    joint_colors = {}

    if "knee" in phase_ideal:
        lo, hi = phase_ideal["knee"]
        c = get_joint_color(angles.get("knee_angle", 90), lo, hi)
        joint_colors[f"{side}_knee"] = c
        joint_colors[f"{side}_hip"] = c
        joint_colors[f"{side}_ankle"] = c

    if "elbow" in phase_ideal:
        lo, hi = phase_ideal["elbow"]
        c = get_joint_color(angles.get("elbow_angle", 90), lo, hi)
        joint_colors[f"{side}_elbow"] = c
        joint_colors[f"{side}_shoulder"] = c
        joint_colors[f"{side}_wrist"] = c

    if "guide_elbow" in phase_ideal:
        opp = "left" if side == "right" else "right"
        lo, hi = phase_ideal["guide_elbow"]
        c = get_joint_color(angles.get("guide_elbow_angle", 90), lo, hi)
        joint_colors[f"{opp}_elbow"] = c
        joint_colors[f"{opp}_wrist"] = c

    for (a_name, b_name) in SKELETON_CONNECTIONS:
        a_idx = LANDMARKS.get(a_name)
        b_idx = LANDMARKS.get(b_name)
        if a_idx is None or b_idx is None:
            continue
        ax = int(landmarks[a_idx].x * w)
        ay = int(landmarks[a_idx].y * h)
        bx = int(landmarks[b_idx].x * w)
        by = int(landmarks[b_idx].y * h)
        color_a = joint_colors.get(a_name, (200, 200, 200))
        color_b = joint_colors.get(b_name, (200, 200, 200))
        mid_color = tuple(int((ca + cb) / 2) for ca, cb in zip(color_a, color_b, strict=False))
        cv2.line(img, (ax, ay), (bx, by), mid_color, 3, cv2.LINE_AA)

    for name, idx in LANDMARKS.items():
        if idx >= len(landmarks):
            continue
        x = int(landmarks[idx].x * w)
        y = int(landmarks[idx].y * h)
        color = joint_colors.get(name, (255, 255, 255))
        cv2.circle(img, (x, y), 6, color, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), 6, (0, 0, 0), 1, cv2.LINE_AA)

    cv2.rectangle(img, (0, 0), (w, 30), (0, 0, 0), -1)
    cv2.putText(img, f"Your Shot — {phase.replace('_', ' ').title()}",
                (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    return cv2.resize(img, size)


# App palette (BGR). Ink bg, slate strips, terracotta = the joint you must fix,
# steel = everything else.
_BG = (28, 21, 17)          # #11151C
_STRIP = (64, 45, 33)       # #212D40
_STEEL = (125, 107, 90)     # #5A6B7D
_KEY = (83, 104, 214)       # #D66853  (terracotta)
_INK_TEXT = (245, 240, 235)
_MUTED_TEXT = (170, 155, 140)
_GOOD = (110, 190, 100)     # in-range readout

# Side-profile reference pose per phase (normalised x,y; figure faces +x).
# Only a sagittal-plane figure can show knee/elbow flexion, which is what the
# "You" frame (filmed from the side) shows.
_IDEAL_PROFILE = {
    "ready_position": {
        "head": (0.50, 0.13), "shoulder": (0.49, 0.26), "elbow": (0.47, 0.40),
        "wrist": (0.49, 0.52), "hip": (0.50, 0.50), "knee": (0.52, 0.68),
        "ankle": (0.50, 0.85), "toe": (0.58, 0.87),
    },
    "load": {
        "head": (0.44, 0.17), "shoulder": (0.43, 0.30), "elbow": (0.40, 0.42),
        "wrist": (0.50, 0.47), "hip": (0.52, 0.52), "knee": (0.60, 0.64),
        "ankle": (0.49, 0.83), "toe": (0.58, 0.85),
    },
    "set_point": {
        "head": (0.49, 0.15), "shoulder": (0.49, 0.28), "elbow": (0.53, 0.34),
        "wrist": (0.51, 0.20), "hip": (0.50, 0.51), "knee": (0.52, 0.70),
        "ankle": (0.50, 0.86), "toe": (0.58, 0.88),
    },
    "release": {
        "head": (0.49, 0.15), "shoulder": (0.49, 0.26), "elbow": (0.52, 0.14),
        "wrist": (0.55, 0.04), "hip": (0.49, 0.50), "knee": (0.49, 0.70),
        "ankle": (0.48, 0.84), "toe": (0.55, 0.89),
    },
    "follow_through": {
        "head": (0.49, 0.15), "shoulder": (0.49, 0.26), "elbow": (0.53, 0.13),
        "wrist": (0.60, 0.20), "hip": (0.49, 0.50), "knee": (0.49, 0.70),
        "ankle": (0.48, 0.85), "toe": (0.55, 0.89),
    },
}
_PROFILE_BONES = [
    ("head", "shoulder"), ("shoulder", "elbow"), ("elbow", "wrist"),
    ("shoulder", "hip"), ("hip", "knee"), ("knee", "ankle"), ("ankle", "toe"),
]
# title, one-line cue, (measured-angle key, label, (lo, hi)), key joints
_IDEAL_PHASE = {
    "ready_position": ("Ready Position", "Stand tall - knees soft",
                       ("knee_angle", "Knee", (155, 175)), {"knee", "hip", "shoulder"}),
    "load":           ("Load", "Sit down - hinge hips back",
                       ("knee_angle", "Knee", (80, 110)), {"knee", "hip"}),
    "set_point":      ("Set Point", "Ball at forehead, elbow under",
                       ("elbow_angle", "Elbow", (85, 100)), {"elbow", "wrist"}),
    "release":        ("Release", "Full extension - rise to toes",
                       ("elbow_angle", "Elbow", (155, 175)), {"elbow", "shoulder"}),
    "follow_through": ("Follow Through", "Hold the gooseneck",
                       ("elbow_angle", "Elbow", (155, 180)), {"wrist", "elbow"}),
}


def draw_ideal_skeleton(phase: str, angles: dict, size: tuple[int, int] = (460, 460)) -> np.ndarray:
    w, h = size
    img = np.full((h, w, 3), _BG, dtype=np.uint8)

    pose = _IDEAL_PROFILE.get(phase, _IDEAL_PROFILE["set_point"])
    title, cue, (metric_key, metric_label, (lo, hi)), key = _IDEAL_PHASE.get(
        phase, _IDEAL_PHASE["set_point"]
    )
    px = {name: (int(x * w), int(y * h)) for name, (x, y) in pose.items()}

    # ground line
    floor_y = int(0.89 * h)
    cv2.line(img, (int(0.12 * w), floor_y), (int(0.88 * w), floor_y), _STRIP, 3, cv2.LINE_AA)

    # bones
    for a, b in _PROFILE_BONES:
        col = _KEY if (a in key and b in key) else _STEEL
        cv2.line(img, px[a], px[b], col, 8, cv2.LINE_AA)
    # joints
    for name, (x, y) in px.items():
        if name == "head":
            cv2.circle(img, (x, y), 16, _STEEL, 3, cv2.LINE_AA)
            continue
        col = _KEY if name in key else _STEEL
        r = 11 if name in key else 8
        cv2.circle(img, (x, y), r, col, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), r, _BG, 2, cv2.LINE_AA)

    # the ball — at the shooting hand for airborne phases, at the hip for stance
    ball_anchor = "wrist" if phase in ("set_point", "release", "follow_through") else "hip"
    bx0, by0 = px[ball_anchor]
    cv2.circle(img, (bx0, by0), 20, _KEY, 2, cv2.LINE_AA)
    cv2.circle(img, (bx0, by0), 20, (60, 80, 150), 1, cv2.LINE_AA)

    # header
    cv2.rectangle(img, (0, 0), (w, 40), _STRIP, -1)
    cv2.putText(img, f"IDEAL - {title}", (14, 27),
                cv2.FONT_HERSHEY_DUPLEX, 0.62, _INK_TEXT, 1, cv2.LINE_AA)

    # target / your-value badge, top-right
    measured = angles.get(metric_key)
    bx = w - 168
    cv2.rectangle(img, (bx, 52), (w - 12, 108 if measured is not None else 82), _STRIP, -1)
    cv2.putText(img, f"Target {lo}-{hi}deg", (bx + 12, 74),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _MUTED_TEXT, 1, cv2.LINE_AA)
    if measured is not None:
        ok = lo <= measured <= hi
        cv2.putText(img, f"You {round(measured)}deg", (bx + 12, 98),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, _GOOD if ok else _KEY, 1, cv2.LINE_AA)

    # cue strip, bottom
    cv2.rectangle(img, (0, h - 44), (w, h), _STRIP, -1)
    cv2.putText(img, cue, (14, h - 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.56, _INK_TEXT, 1, cv2.LINE_AA)
    return img


def generate_pose_gif(
    frames: list[dict | None],
    angles_list: list[dict | None],
    max_frames: int = 30,
    size: tuple[int, int] = (360, 360),
    frame_duration_ms: int = 160,
) -> str:
    valid = [(f, a) for f, a in zip(frames, angles_list, strict=False)
             if f is not None and a is not None]
    if not valid:
        return ""

    step = max(1, len(valid) // max_frames)
    sampled = valid[::step][:max_frames]
    pil_frames = []

    for frame_data, angle_data in sampled:
        raw_frame = frame_data.get("_frame")
        raw_lm = frame_data.get("_raw_landmarks")
        if raw_frame is None or raw_lm is None:
            continue
        drawn = draw_skeleton_on_frame(raw_frame, raw_lm, angle_data, "release", size)
        rgb = cv2.cvtColor(drawn, cv2.COLOR_BGR2RGB)
        pil_frames.append(Image.fromarray(rgb))

    if not pil_frames:
        return ""

    buf = io.BytesIO()
    pil_frames[0].save(
        buf, format="GIF",
        save_all=True,
        append_images=pil_frames[1:],
        loop=0,
        duration=frame_duration_ms,
        optimize=True,
    )
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def extract_phase_frame_b64(
    frame_data: dict | None,
    angles: dict | None,
    phase: str,
    size: tuple[int, int] = (460, 460),
) -> tuple[str, str]:
    if angles:
        ideal_img = draw_ideal_skeleton(phase, angles, size)
    else:
        ideal_img = np.zeros((size[1], size[0], 3), dtype=np.uint8)

    _, ideal_buf = cv2.imencode(".jpg", ideal_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    ideal_b64 = base64.b64encode(ideal_buf).decode("utf-8")

    if frame_data is None or angles is None:
        return "", ideal_b64

    raw_frame = frame_data.get("_frame")
    raw_lm = frame_data.get("_raw_landmarks")
    if raw_frame is None or raw_lm is None:
        return "", ideal_b64

    user_img = draw_skeleton_on_frame(raw_frame, raw_lm, angles, phase, size)
    _, user_buf = cv2.imencode(".jpg", user_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    user_b64 = base64.b64encode(user_buf).decode("utf-8")
    return user_b64, ideal_b64


_PHASES = ["ready_position", "load", "set_point", "release", "follow_through"]


def render_phase_images(frames, angles_list, phases, phase_angles, size=(460, 460)):
    by_index = {i: f for i, f in enumerate(frames)}
    out = {}
    for phase in _PHASES:
        idx = phases.get(phase)
        frame_data = by_index.get(idx) if idx is not None else None
        angles = phase_angles.get(phase)
        user_b64, ideal_b64 = extract_phase_frame_b64(frame_data, angles, phase, size=size)
        out[phase] = {"user_frame": user_b64, "ideal_frame": ideal_b64}
    return out


def render_all(frames: list, metrics: list, phases: dict, phase_metrics: dict) -> dict:
    return {
        "pose_gif": generate_pose_gif(frames, metrics),
        "phase_images": render_phase_images(frames, metrics, phases, phase_metrics),
    }
