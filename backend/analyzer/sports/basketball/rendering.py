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


def draw_ideal_skeleton(phase: str, angles: dict, size: tuple[int, int] = (400, 400)) -> np.ndarray:
    w, h = size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = (20, 20, 30)
    side = angles.get("shooting_side", "right")

    ideal_positions = {
        "load": {
            "nose": (0.50, 0.12),
            "left_shoulder": (0.38, 0.28), "right_shoulder": (0.62, 0.28),
            "left_elbow": (0.28, 0.40),    "right_elbow": (0.75, 0.36),
            "left_wrist": (0.32, 0.52),    "right_wrist": (0.68, 0.26),
            "left_hip": (0.40, 0.52),      "right_hip": (0.60, 0.52),
            "left_knee": (0.36, 0.70),     "right_knee": (0.58, 0.70),
            "left_ankle": (0.34, 0.88),    "right_ankle": (0.56, 0.88),
            "left_foot": (0.30, 0.94),     "right_foot": (0.60, 0.94),
        },
        "set_point": {
            "nose": (0.50, 0.10),
            "left_shoulder": (0.38, 0.26), "right_shoulder": (0.62, 0.26),
            "left_elbow": (0.26, 0.36),    "right_elbow": (0.72, 0.22),
            "left_wrist": (0.30, 0.24),    "right_wrist": (0.65, 0.12),
            "left_hip": (0.40, 0.50),      "right_hip": (0.60, 0.50),
            "left_knee": (0.37, 0.68),     "right_knee": (0.58, 0.68),
            "left_ankle": (0.35, 0.86),    "right_ankle": (0.56, 0.86),
            "left_foot": (0.31, 0.93),     "right_foot": (0.60, 0.93),
        },
        "release": {
            "nose": (0.50, 0.08),
            "left_shoulder": (0.38, 0.24), "right_shoulder": (0.62, 0.22),
            "left_elbow": (0.24, 0.28),    "right_elbow": (0.74, 0.14),
            "left_wrist": (0.26, 0.14),    "right_wrist": (0.72, 0.04),
            "left_hip": (0.40, 0.48),      "right_hip": (0.60, 0.48),
            "left_knee": (0.38, 0.64),     "right_knee": (0.58, 0.64),
            "left_ankle": (0.36, 0.82),    "right_ankle": (0.56, 0.82),
            "left_foot": (0.32, 0.90),     "right_foot": (0.60, 0.90),
        },
        "follow_through": {
            "nose": (0.50, 0.08),
            "left_shoulder": (0.38, 0.24), "right_shoulder": (0.62, 0.22),
            "left_elbow": (0.24, 0.22),    "right_elbow": (0.76, 0.12),
            "left_wrist": (0.22, 0.10),    "right_wrist": (0.78, 0.20),
            "left_hip": (0.40, 0.48),      "right_hip": (0.60, 0.48),
            "left_knee": (0.38, 0.66),     "right_knee": (0.58, 0.66),
            "left_ankle": (0.36, 0.84),    "right_ankle": (0.56, 0.84),
            "left_foot": (0.32, 0.92),     "right_foot": (0.60, 0.92),
        },
        "ready_position": {
            "nose": (0.50, 0.10),
            "left_shoulder": (0.38, 0.26), "right_shoulder": (0.62, 0.26),
            "left_elbow": (0.28, 0.40),    "right_elbow": (0.72, 0.40),
            "left_wrist": (0.30, 0.52),    "right_wrist": (0.70, 0.52),
            "left_hip": (0.40, 0.52),      "right_hip": (0.60, 0.52),
            "left_knee": (0.38, 0.72),     "right_knee": (0.58, 0.72),
            "left_ankle": (0.36, 0.88),    "right_ankle": (0.56, 0.88),
            "left_foot": (0.32, 0.94),     "right_foot": (0.60, 0.94),
        },
    }

    positions = ideal_positions.get(phase, ideal_positions["set_point"])
    key_joints = {
        "load":           [f"{side}_knee", f"{side}_hip", f"{side}_ankle"],
        "set_point":      [f"{side}_elbow", f"{side}_wrist", f"{side}_shoulder"],
        "release":        [f"{side}_elbow", f"{side}_wrist", f"{side}_knee"],
        "follow_through": [f"{side}_elbow", f"{side}_wrist"],
        "ready_position": [f"{side}_knee", "left_shoulder", "right_shoulder"],
    }
    keys = key_joints.get(phase, [])

    for (a_name, b_name) in SKELETON_CONNECTIONS:
        if a_name not in positions or b_name not in positions:
            continue
        ax = int(positions[a_name][0] * w)
        ay = int(positions[a_name][1] * h)
        bx = int(positions[b_name][0] * w)
        by = int(positions[b_name][1] * h)
        ca = (0, 220, 0) if a_name in keys else (180, 180, 180)
        cb = (0, 220, 0) if b_name in keys else (180, 180, 180)
        mid = tuple(int((x + y) / 2) for x, y in zip(ca, cb, strict=False))
        cv2.line(img, (ax, ay), (bx, by), mid, 3, cv2.LINE_AA)

    for name, pos in positions.items():
        x = int(pos[0] * w)
        y = int(pos[1] * h)
        color = (0, 220, 0) if name in keys else (180, 180, 180)
        cv2.circle(img, (x, y), 7, color, -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), 7, (0, 0, 0), 1, cv2.LINE_AA)

    cv2.rectangle(img, (0, 0), (w, 30), (0, 0, 0), -1)
    cv2.putText(img, "Ideal Form  (green = key joints)",
                (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 220, 0), 1)

    angle_labels = {
        "load":           [("Knee: 80-110°", (0.42, 0.72)), ("Elbow: 80-110°", (0.65, 0.42))],
        "set_point":      [("Elbow: 85-100°", (0.62, 0.18)), ("Guide: 60-100°", (0.20, 0.32))],
        "release":        [("Elbow: 155-175°", (0.62, 0.10)), ("Legs: Straight", (0.42, 0.64))],
        "follow_through": [("Wrist snap ↓", (0.70, 0.22)), ("Hold pose", (0.30, 0.18))],
        "ready_position": [("Feet: shoulder width", (0.30, 0.90)), ("Stand tall", (0.38, 0.20))],
    }
    for label, (nx, ny) in angle_labels.get(phase, []):
        px, py = int(nx * w), int(ny * h)
        cv2.putText(img, label, (px, py),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 220, 50), 1, cv2.LINE_AA)
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
    size: tuple[int, int] = (400, 400),
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


def render_phase_images(frames, angles_list, phases, phase_angles, size=(380, 380)):
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
