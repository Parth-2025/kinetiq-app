"""Experimental body motion plus bounded optional ball evidence; no technique score."""
import hashlib
import math
from pathlib import Path

import numpy as np
from studio.motion_quality import segment_repetition_candidates, visibility_diagnostics
from studio.shot_analysis import summarize_shot_candidates


def flexion(points, a, b, c):
    if any(points[i] is None or points[i][3] < 0.65 for i in (a, b, c)):
        return None
    x, y, z = (np.asarray(points[i][:3], dtype=float) for i in (a, b, c))
    u, v = x - y, z - y
    denominator = float(np.linalg.norm(u) * np.linalg.norm(v))
    if not math.isfinite(denominator) or denominator < 1e-8:
        return None
    angle = 180 - math.degrees(math.acos(float(np.clip(np.dot(u, v) / denominator, -1, 1))))
    return round(angle, 1) if math.isfinite(angle) else None


def image_landmark_evidence(image_points):
    """Require a conservative image margin; preserve edge reasons independently."""
    labels = {0: "head", 11: "left_shoulder", 12: "right_shoulder", 15: "left_wrist",
              16: "right_wrist", 23: "left_hip", 24: "right_hip", 27: "left_ankle",
              28: "right_ankle", 31: "left_foot", 32: "right_foot"}
    evidence = {"visible_required": [], "missing_required": [], "near_edge": []}
    for i, label in labels.items():
        point = image_points[i]
        finite = math.isfinite(point.x) and math.isfinite(point.y)
        if finite and min(point.x, point.y, 1-point.x, 1-point.y) < 0.035:
            evidence["near_edge"].append(label)
        inside = finite and 0.01 <= point.x <= 0.99 and 0.01 <= point.y <= 0.99
        visible = inside and math.isfinite(point.visibility) and point.visibility >= 0.65
        evidence["visible_required" if visible else "missing_required"].append(label)
    return evidence


def analyze(path: Path, dominant_side: str):
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    from analyzer.pose import ensure_model

    if dominant_side not in ("left", "right"):
        raise ValueError("Choose the athlete's shooting side before analysis.")
    model_path = ensure_model()
    model_digest = hashlib.sha256(Path(model_path).read_bytes()).hexdigest()
    options = vision.PoseLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO, num_poses=2,
        min_pose_detection_confidence=0.65, min_pose_presence_confidence=0.65, min_tracking_confidence=0.65)
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("The video could not be decoded. Choose a supported video file.")
    fps = capture.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        raise ValueError("This video has no usable frame timing. Try a new recording.")
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if frame_count / fps > 60.5:
        capture.release()
        raise ValueError("Use a recording of 60 seconds or less for this prototype.")
    frames = []
    index = 0
    last_ms = -1
    fallback_timing = False
    next_sample_ms = 0
    side = "left" if dominant_side == "left" else "right"
    elbow = (11, 13, 15) if side == "left" else (12, 14, 16)
    knee = (23, 25, 27) if side == "left" else (24, 26, 28)
    try:
        with vision.PoseLandmarker.create_from_options(options) as detector:
            while capture.isOpened():
                ok, frame = capture.read()
                if not ok:
                    break
                timestamp = capture.get(cv2.CAP_PROP_POS_MSEC)
                if not math.isfinite(timestamp) or (index > 0 and timestamp <= last_ms):
                    timestamp = max(last_ms + 1, index / fps * 1000)
                    fallback_timing = True
                index += 1
                timestamp = int(round(timestamp))
                if timestamp <= last_ms:
                    timestamp = last_ms + 1
                last_ms = timestamp
                if timestamp > 60000 or index > 18000:
                    raise ValueError("Use a recording of 60 seconds or less.")
                if timestamp < next_sample_ms:
                    continue
                next_sample_ms = timestamp + 65  # bounded numerical replay; not a ball-release sampler
                if max(frame.shape[:2]) > 1280:
                    scale = 1280 / max(frame.shape[:2])
                    frame = cv2.resize(frame, (round(frame.shape[1] * scale), round(frame.shape[0] * scale)))
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                points = [None] * 33
                image_evidence = {"visible_required": [], "missing_required": [], "near_edge": []}
                image_pose = {"person_count": len(result.pose_landmarks), "wrist": None, "shoulder": None}
                quality = "no_pose"
                if len(result.pose_world_landmarks) > 1:
                    quality = "multiple_people"
                elif len(result.pose_world_landmarks) == 1 and result.pose_landmarks:
                    image_points = result.pose_landmarks[0]
                    for label, joint in (("wrist", elbow[2]), ("shoulder", elbow[0])):
                        p = image_points[joint]
                        if all(math.isfinite(v) for v in (p.x, p.y, p.visibility)) and p.visibility >= 0.65 and 0 <= p.x <= 1 and 0 <= p.y <= 1:
                            image_pose[label] = [round(p.x, 6), round(p.y, 6)]
                    image_evidence = image_landmark_evidence(image_points)
                    full_body = not image_evidence["missing_required"]
                    quality = "usable" if full_body else "partial_body_or_occlusion"
                    for i, point in enumerate(result.pose_world_landmarks[0]):
                        visibility = min(point.visibility, image_points[i].visibility)
                        values = [point.x, point.y, point.z, visibility]
                        if all(math.isfinite(v) for v in values) and 0 <= image_points[i].x <= 1 and 0 <= image_points[i].y <= 1:
                            points[i] = [round(v, 5) for v in values]
                frames.append({"time_ms": timestamp, "source_frame_index": index - 1, "points": points, "quality": quality,
                    "image_evidence": image_evidence,
                    "image_pose": image_pose,
                    "elbow_flexion": flexion(points, *elbow) if quality == "usable" else None,
                    "knee_flexion": flexion(points, *knee) if quality == "usable" else None})
    finally:
        capture.release()
    if not frames or not any(any(p is not None for p in f["points"]) for f in frames):
        raise ValueError("No usable pose was detected. Keep one athlete fully visible in good light.")
    summary = {}
    for name in ("elbow_flexion", "knee_flexion"):
        values = [f[name] for f in frames if f[name] is not None]
        summary[name] = {"minimum": min(values) if values else None, "maximum": max(values) if values else None,
            "valid_samples": len(values), "total_samples": len(frames), "unit": "deg",
            "status": "experimental" if values else "unavailable"}
    segmentation = segment_repetition_candidates(frames)
    from studio.ball_video import analyze_ball_video
    ball = analyze_ball_video(path, frames)
    return {"version": "studio-motion-1", "provider": "mediapipe-heavy-world",
        "provider_version": mp.__version__,
        "model_sha256": model_digest, "sampling_interval_ms": 65,
        "coordinate_system": "mediapipe_world_hip_relative_meters", "side": side,
        "angle_convention": "flexion_0_at_extension", "timestamp_mode": "nominal_fallback" if fallback_timing else "decoded_presentation",
        "duration_ms": frames[-1]["time_ms"], "frames": frames, "summary": summary,
        "quality_counts": {reason: sum(f["quality"] == reason for f in frames) for reason in {f["quality"] for f in frames}},
        "capture_diagnostics": visibility_diagnostics(frames),
        "repetition_segmentation": segmentation,
        "repetitions": segmentation["candidates"],
        "shot_candidates": summarize_shot_candidates(frames, segmentation["candidates"]),
        "ball": ball,
        "limitations": ["Experimental pose estimates; not validated basketball biomechanics.",
            "Frames with detected multiple people, cropped body, or low visibility do not produce angle measurements. This gate is heuristic, not validated identity tracking.",
            "Ball-supported release candidates require review; outcomes, physical speed/arc and spin are not measured.",
            "Frame ranges describe this clip, not repetition consistency."]}
