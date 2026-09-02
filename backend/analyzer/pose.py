import threading
import urllib.request
from pathlib import Path

import numpy as np
from settings import settings

LANDMARKS = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
    "left_heel": 29, "right_heel": 30,
    "left_foot": 31, "right_foot": 32,
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
}

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
_model_lock = threading.Lock()
_model_path: Path | None = None


def ensure_model() -> str:
    global _model_path
    if _model_path is not None and _model_path.exists():
        return str(_model_path)
    with _model_lock:
        if _model_path is not None and _model_path.exists():
            return str(_model_path)
        settings.model_cache_dir.mkdir(parents=True, exist_ok=True)
        dest = settings.model_cache_dir / "pose_landmarker_heavy.task"
        if not dest.exists():
            tmp = dest.with_suffix(".task.download")
            urllib.request.urlretrieve(_MODEL_URL, tmp)
            tmp.replace(dest)
        _model_path = dest
        return str(dest)


def extract_landmarks_from_video(video_path: str) -> list:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = ensure_model()
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
    frames: list = []
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

            if result.pose_landmarks:
                lm = result.pose_landmarks[0]
                frame_data = {"_raw_landmarks": lm, "_frame": frame.copy()}
                for name, idx in LANDMARKS.items():
                    vis = getattr(lm[idx], "visibility", 1.0)
                    frame_data[name] = np.array([lm[idx].x, lm[idx].y, lm[idx].z, vis])
                frames.append(frame_data)
            else:
                frames.append(None)
            frame_idx += 1

    cap.release()
    return frames
