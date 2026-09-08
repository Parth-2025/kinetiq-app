"""Skeleton constants + shared frame/GIF drawing.

``SKELETON_CONNECTIONS`` / ``get_joint_color`` are stdlib-free; the drawing
functions below (``draw_skeleton_on_frame``, ``generate_pose_gif``,
``extract_phase_frame_b64``) were lifted verbatim from
``analyzer/sports/basketball/rendering.py`` so every sport plugin can share
them. Sport-specific data (e.g. basketball's ``IDEAL_RANGES``) is threaded in
via keyword params rather than moved here.
"""

import base64
import io

import cv2
import numpy as np
from PIL import Image

from analyzer.geometry import LANDMARKS

SKELETON_CONNECTIONS = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_foot"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_foot"),
    ("nose", "left_shoulder"),
    ("nose", "right_shoulder"),
]


def get_joint_color(angle: float, ideal_low: float, ideal_high: float) -> tuple[int, int, int]:
    if ideal_low <= angle <= ideal_high:
        return (0, 220, 0)
    deviation = min(abs(angle - ideal_low), abs(angle - ideal_high))
    if deviation < 20:
        return (0, 200, 255)
    return (0, 0, 255)


def draw_skeleton_on_frame(
    frame: np.ndarray,
    landmarks: list,
    angles: dict,
    phase: str,
    size: tuple[int, int] = (400, 400),
    *,
    ideal_ranges: dict | None = None,
    label: str = "Your Shot",
) -> np.ndarray:
    h, w = frame.shape[:2]
    img = frame.copy()
    side = angles.get("shooting_side", "right")
    joint_colors = {}

    if ideal_ranges is not None:
        phase_ideal = ideal_ranges.get(phase, {})

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
    cv2.putText(img, f"{label} — {phase.replace('_', ' ').title()}",
                (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    return cv2.resize(img, size)


def generate_pose_gif(
    frames: list[dict | None],
    angles_list: list[dict | None],
    max_frames: int = 30,
    size: tuple[int, int] = (360, 360),
    frame_duration_ms: int = 160,
    *,
    ideal_ranges: dict | None = None,
    phase: str = "release",
    label: str = "Your Shot",
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
        drawn = draw_skeleton_on_frame(
            raw_frame, raw_lm, angle_data, phase, size,
            ideal_ranges=ideal_ranges, label=label,
        )
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
    *,
    draw_ideal=None,
    ideal_ranges: dict | None = None,
) -> tuple[str, str]:
    if angles and draw_ideal is not None:
        ideal_img = draw_ideal(phase, angles, size)
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

    user_img = draw_skeleton_on_frame(
        raw_frame, raw_lm, angles, phase, size, ideal_ranges=ideal_ranges
    )
    _, user_buf = cv2.imencode(".jpg", user_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    user_b64 = base64.b64encode(user_buf).decode("utf-8")
    return user_b64, ideal_b64
