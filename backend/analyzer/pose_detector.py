import cv2
import mediapipe as mp
import numpy as np
import base64
import io
import os
import urllib.request
from typing import List, Dict, Optional, Tuple
from PIL import Image

# ── MediaPipe landmark indices ─────────────────────────────────────────────
LANDMARKS = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13,    "right_elbow": 14,
    "left_wrist": 15,    "right_wrist": 16,
    "left_hip": 23,      "right_hip": 24,
    "left_knee": 25,     "right_knee": 26,
    "left_ankle": 27,    "right_ankle": 28,
    "left_heel": 29,     "right_heel": 30,
    "left_foot": 31,     "right_foot": 32,
    "nose": 0,
    "left_eye": 2,       "right_eye": 5,
    "left_ear": 7,       "right_ear": 8,
}

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

IDEAL_RANGES = {
    "load":          {"knee": (80, 110),   "elbow": (80, 110),  "hip": (100, 140)},
    "set_point":     {"elbow": (85, 100),  "guide_elbow": (60, 100), "knee": (100, 150)},
    "release":       {"elbow": (155, 175), "knee": (160, 180),  "shoulder_tilt": (0, 0.05)},
    "follow_through":{"elbow": (155, 180), "wrist_drop": (0.05, 0.3)},
}

def calculate_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))

def get_joint_color(angle: float, ideal_low: float, ideal_high: float) -> Tuple[int, int, int]:
    if ideal_low <= angle <= ideal_high:
        return (0, 220, 0)
    deviation = min(abs(angle - ideal_low), abs(angle - ideal_high))
    if deviation < 20:
        return (0, 200, 255)
    return (0, 0, 255)

def _download_model() -> str:
    model_path = "/tmp/pose_landmarker_heavy.task"
    if not os.path.exists(model_path):
        print("Downloading MediaPipe pose model (~29MB)...")
        urllib.request.urlretrieve(
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
            model_path
        )
        print("Model ready.")
    return model_path

def extract_landmarks_from_video(video_path: str) -> List[Optional[Dict]]:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = _download_model()
    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    all_frames = []
    frame_idx = 0

    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((frame_idx / fps) * 1000)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks and len(result.pose_landmarks) > 0:
                lm = result.pose_landmarks[0]
                frame_data = {"_raw_landmarks": lm, "_frame": frame.copy()}
                for name, idx in LANDMARKS.items():
                    frame_data[name] = np.array([
                        lm[idx].x, lm[idx].y, lm[idx].z,
                        lm[idx].visibility if hasattr(lm[idx], 'visibility') else 1.0,
                    ])
                all_frames.append(frame_data)
            else:
                all_frames.append(None)
            frame_idx += 1

    cap.release()
    return all_frames

def compute_angles_per_frame(frames: List[Optional[Dict]]) -> List[Optional[Dict]]:
    angles_list = []
    for frame in frames:
        if frame is None:
            angles_list.append(None)
            continue

        lw_y = frame["left_wrist"][1]
        rw_y = frame["right_wrist"][1]
        side = "right" if rw_y < lw_y else "left"
        opp = "left" if side == "right" else "right"

        angles = {
            "shooting_side": side,
            "elbow_angle": calculate_angle(
                frame[f"{side}_shoulder"][:3],
                frame[f"{side}_elbow"][:3],
                frame[f"{side}_wrist"][:3],
            ),
            "knee_angle": calculate_angle(
                frame[f"{side}_hip"][:3],
                frame[f"{side}_knee"][:3],
                frame[f"{side}_ankle"][:3],
            ),
            "hip_angle": calculate_angle(
                frame[f"{side}_shoulder"][:3],
                frame[f"{side}_hip"][:3],
                frame[f"{side}_knee"][:3],
            ),
            "shoulder_tilt": abs(frame["left_shoulder"][1] - frame["right_shoulder"][1]),
            "hip_tilt": abs(frame["left_hip"][1] - frame["right_hip"][1]),
            "guide_elbow_angle": calculate_angle(
                frame[f"{opp}_shoulder"][:3],
                frame[f"{opp}_elbow"][:3],
                frame[f"{opp}_wrist"][:3],
            ),
            "shooting_wrist_y": frame[f"{side}_wrist"][1],
            "shooting_elbow_y": frame[f"{side}_elbow"][1],
            "_frame": frame.get("_frame"),
            "_raw_landmarks": frame.get("_raw_landmarks"),
        }
        angles_list.append(angles)
    return angles_list

def draw_skeleton_on_frame(
    frame: np.ndarray,
    landmarks: List,
    angles: Dict,
    phase: str,
    size: Tuple[int, int] = (400, 400),
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
        mid_color = tuple(int((ca + cb) / 2) for ca, cb in zip(color_a, color_b))
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

def draw_ideal_skeleton(phase: str, angles: Dict, size: Tuple[int, int] = (400, 400)) -> np.ndarray:
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
        mid = tuple(int((x + y) / 2) for x, y in zip(ca, cb))
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
    frames: List[Optional[Dict]],
    angles_list: List[Optional[Dict]],
    max_frames: int = 30,
    size: Tuple[int, int] = (360, 360),
    frame_duration_ms: int = 160,
) -> str:
    valid = [(f, a) for f, a in zip(frames, angles_list) if f is not None and a is not None]
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
    frame_data: Optional[Dict],
    angles: Optional[Dict],
    phase: str,
    size: Tuple[int, int] = (400, 400),
) -> Tuple[str, str]:
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
