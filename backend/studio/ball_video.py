"""Bounded experimental ball evidence pass while original RGB is still present."""
from bisect import bisect_left
import hashlib
import json
import logging
import math
from pathlib import Path
import time

logger = logging.getLogger(__name__)


def unavailable(reason, code="ball_pipeline_unavailable"):
    return {"schema_version": "ball_video.v1", "status": "unavailable", "reason_code": code,
            "reason": reason, "tracks": [], "attempts": [], "source_required_for_retry": True}


def _analyze_ball_video(path: Path, pose_frames: list, *, detector=None, budget_seconds=60.0):
    import cv2
    from settings import settings
    from studio.ball_detector import BallDetector
    from studio.ball_tracking import analyze_ball_observations

    if not settings.studio_ball_enabled and detector is None:
        return unavailable("Ball analysis is disabled for this worker.", "disabled")
    try:
        detector = detector or BallDetector(settings.model_cache_dir / "yolox_nano.onnx")
    except Exception as exc:
        logger.warning("Ball detector unavailable: %s", type(exc).__name__)
        return unavailable("Install the pinned ball model with python -m studio.download_ball_model.", "model_unavailable")

    if not isinstance(budget_seconds, (int, float)) or not math.isfinite(budget_seconds) or budget_seconds <= 0:
        return unavailable("Ball analysis has no usable time budget.", "invalid_budget")

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        return unavailable("The ball pass could not decode this video.", "decode_failed")
    observations = []
    pose_rows = []
    for f in pose_frames:
        if isinstance(f, dict) and isinstance(f.get("time_ms"), (int, float)) and math.isfinite(f["time_ms"]):
            pose_rows.append(f)
    pose_rows.sort(key=lambda f: f["time_ms"])
    times = [f["time_ms"] for f in pose_rows]
    started = time.monotonic()
    last_ms, next_sample_ms, index = -1, 0, 0
    timing_fallback, incomplete_reason = False, None
    fps = capture.get(cv2.CAP_PROP_FPS)
    expected_frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        return unavailable("No usable video frame timing.", "invalid_timing")
    expected_frames = int(expected_frames) if math.isfinite(expected_frames) and expected_frames > 0 else None
    if expected_frames is not None and expected_frames / fps > 60.5:
        capture.release()
        return unavailable("Use a recording of 60 seconds or less.", "clip_limit")
    try:
        while capture.isOpened():
            if time.monotonic() - started > budget_seconds:
                incomplete_reason = "Ball processing reached its time budget; later frames were not analyzed."
                break
            ok, frame = capture.read()
            if not ok:
                break
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC)
            if not math.isfinite(timestamp) or (index > 0 and timestamp <= last_ms):
                timestamp = max(last_ms + 1, index / fps * 1000)
                timing_fallback = True
            timestamp = max(last_ms + 1, int(round(timestamp)))
            last_ms = timestamp
            frame_index = index
            index += 1
            if timestamp > 60000 or index > 18000 or len(observations) >= 1801:
                incomplete_reason = "Ball processing reached the clip/frame limit."
                break
            if timestamp < next_sample_ms:
                continue
            next_sample_ms = timestamp + 33
            height, width = frame.shape[:2]
            detections = detector.detect(frame)
            nearest = bisect_left(times, timestamp)
            choices = [i for i in (nearest - 1, nearest) if 0 <= i < len(times) and times[i] <= timestamp]
            pose = min((pose_rows[i] for i in choices), key=lambda f: abs(f["time_ms"] - timestamp), default=None)
            # Pose evidence can support a ball sample only when it was observed
            # at or before that sample; future pose observations are not causal.
            fresh = pose is not None and 0 <= timestamp - pose["time_ms"] <= 100
            evidence = pose.get("image_pose", {}) if fresh else {}
            observations.append({"time_ms": timestamp, "frame_index": frame_index,
                "width_px": width, "height_px": height, "detections": detections,
                "wrist": evidence.get("wrist"), "shoulder": evidence.get("shoulder"),
                "person_count": evidence.get("person_count", 0),
                "pose_time_ms": pose["time_ms"] if fresh else None})
    except Exception as exc:
        logger.warning("Ball inference interrupted: %s", type(exc).__name__)
        incomplete_reason = "Ball inference failed; only preceding observations are retained."
    finally:
        capture.release()
    if not observations:
        return unavailable(incomplete_reason or "No video samples could be processed.", "no_processed_samples")
    if incomplete_reason is None and expected_frames is not None and index < expected_frames:
        incomplete_reason = "Video decoding stopped before the reported frame count; completeness is unknown."
    try:
        result = analyze_ball_observations(observations)
    except Exception as exc:
        logger.warning("Ball tracking failed: %s", type(exc).__name__)
        result = {"schema_version": "ball_tracks.v1", "status": "unavailable",
                  "tracks": [], "attempts": [], "quality": {"input_frames": len(observations)},
                  "limitations": ["Ball tracking failed; body motion analysis remains available."]}
        incomplete_reason = incomplete_reason or "Ball tracking failed after video observations were collected."
    try:
        with path.open("rb") as source:
            source_hash = hashlib.file_digest(source, "sha256").hexdigest()
    except (OSError, ValueError):
        source_hash = None
        incomplete_reason = incomplete_reason or "The source could not be hashed after analysis."
    try:
        detector_metadata = detector.metadata
    except Exception:
        detector_metadata = {"status": "unavailable"}
        incomplete_reason = incomplete_reason or "Detector metadata could not be recorded."
    return {**result, "schema_version": "ball_video.v1",
        "status": "partial" if incomplete_reason else result["status"],
        "reason": incomplete_reason,
        "detector": detector_metadata,
        "source": {"sha256": source_hash, "time_basis": "nominal_fallback" if timing_fallback else "decoded_presentation",
            "sample_interval_target_ms": 33, "processed_samples": len(observations),
            "last_processed_time_ms": observations[-1]["time_ms"], "complete": incomplete_reason is None,
            "reported_frame_count": expected_frames, "decoded_frame_count": index,
            "width_px": observations[0]["width_px"], "height_px": observations[0]["height_px"]},
        "observations": observations, "source_required_for_retry": True}


def analyze_ball_video(path: Path, pose_frames: list, *, detector=None, budget_seconds=60.0):
    """Optional side pass: unexpected failures become ball-only unavailable data."""
    try:
        result = _analyze_ball_video(path, pose_frames, detector=detector,
                                     budget_seconds=budget_seconds)
        # Preserve room for body observations under the worker's 8 MiB limit.
        # Never truncate tracks silently or let optional ball evidence discard
        # an otherwise usable body report.
        if len(json.dumps(result, allow_nan=False, separators=(",", ":")).encode("utf-8")) > 3 * 1024 * 1024:
            return unavailable("Ball observations exceeded the storage budget. Use a shorter clip with one visible ball.", "evidence_size_limit")
        return result
    except Exception as exc:
        logger.warning("Ball video pass unavailable: %s", type(exc).__name__)
        return unavailable("The optional ball pass could not complete; body motion analysis remains available.",
                           "ball_pipeline_failed")
