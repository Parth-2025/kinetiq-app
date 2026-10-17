"""Allowlisted queries over retained studio-motion-1 numerical samples."""
from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable

import numpy as np

MAX_INTERVAL_SECONDS = 60.0
MAX_OUTPUT_SAMPLES = 1000
SUPPORTED_VERSION = "studio-motion-1"
SUPPORTED_PROVIDER = "mediapipe-heavy-world"
SUPPORTED_CONVENTION = "flexion_0_at_extension"
SUPPORTED_COORDINATES = "mediapipe_world_hip_relative_meters"
JOINTS = {
    "left_elbow": (11, 13, 15), "right_elbow": (12, 14, 16),
    "left_knee": (23, 25, 27), "right_knee": (24, 26, 28),
}
AGGREGATIONS = {"min", "max", "mean"}


class UnsupportedAnalysis(ValueError):
    """Stored evidence does not satisfy the only numerical query contract."""


def content_revision(analysis: dict) -> str:
    """Deterministic content identity for the saved analysis, not a DB revision."""
    canonical = json.dumps(analysis, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _angle(points, indices) -> float | None:
    try:
        selected = [points[index] for index in indices]
        if any(not isinstance(p, (list, tuple)) or len(p) < 4 for p in selected):
            return None
        if any(not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in p[:4])
               or not 0.0 <= p[3] <= 1.0 or p[3] < 0.65 for p in selected):
            return None
        a, b, c = (np.asarray(p[:3], dtype=float) for p in selected)
        u, v = a - b, c - b
        denominator = float(np.linalg.norm(u) * np.linalg.norm(v))
        if not math.isfinite(denominator) or denominator < 1e-8:
            return None
        angle = 180.0 - math.degrees(math.acos(float(np.clip(np.dot(u, v) / denominator, -1.0, 1.0))))
        return round(angle, 1) if math.isfinite(angle) else None
    except (IndexError, TypeError, ValueError, OverflowError):
        return None


def query(analysis: dict, *, joint: str, start: float, end: float,
          aggregation: Iterable[str]) -> dict:
    """Recompute a joint series for a closed-open interval without interpolation."""
    if (not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                for value in (start, end)) or start < 0 or end <= start
            or end > MAX_INTERVAL_SECONDS):
        raise ValueError("Choose an interval within 0 to 60 seconds, with end after start.")
    if analysis.get("version") != SUPPORTED_VERSION or analysis.get("provider") != SUPPORTED_PROVIDER:
        raise UnsupportedAnalysis("This saved analysis provider or version is unsupported for numerical reanalysis.")
    if (analysis.get("angle_convention") != SUPPORTED_CONVENTION
            or analysis.get("coordinate_system") != SUPPORTED_COORDINATES
            or analysis.get("timestamp_mode") not in {"decoded_presentation", "nominal_fallback"}):
        raise UnsupportedAnalysis("This saved analysis contract is unsupported for numerical reanalysis.")
    if joint not in JOINTS:
        raise ValueError("Choose a supported left or right elbow or knee.")
    frames = analysis.get("frames")
    if not isinstance(frames, list):
        raise UnsupportedAnalysis("Saved numerical frames are unavailable; source video is required.")
    if len(frames) > MAX_OUTPUT_SAMPLES:
        raise OverflowError("Saved analysis has too many frames for this query.")
    selected = []
    previous_ms = None
    for frame in frames:
        if not isinstance(frame, dict):
            raise UnsupportedAnalysis("Saved analysis contains malformed frame records.")
        ms = frame.get("time_ms")
        if (not isinstance(ms, (int, float)) or isinstance(ms, bool) or not math.isfinite(ms)
                or not 0 <= ms <= MAX_INTERVAL_SECONDS * 1000):
            raise UnsupportedAnalysis("Saved analysis has invalid timestamps and cannot be queried safely.")
        if previous_ms is not None and ms <= previous_ms:
            raise UnsupportedAnalysis("Saved analysis timestamps are not strictly increasing.")
        previous_ms = ms
        t = ms / 1000.0
        if start <= t < end:
            selected.append((t, frame))
    if len(selected) > MAX_OUTPUT_SAMPLES:
        raise OverflowError("This interval has too many stored samples. Choose a shorter interval.")
    samples = []
    values = []
    for t, frame in selected:
        value = None
        reason = None
        quality = frame.get("quality")
        if quality != "usable":
            reason = quality if isinstance(quality, str) and quality else "unusable_frame_quality"
        else:
            value = _angle(frame.get("points"), JOINTS[joint])
            if value is None:
                reason = "missing_nonfinite_or_low_visibility_joint_points"
            else:
                values.append(value)
        samples.append({"time_seconds": round(t, 3), "value": value, "reason": reason})
    requested = list(aggregation)
    aggregates = {}
    for name in requested:
        if name == "min": aggregates[name] = min(values) if values else None
        elif name == "max": aggregates[name] = max(values) if values else None
        elif name == "mean": aggregates[name] = round(sum(values) / len(values), 1) if values else None
    total = len(samples)
    nominal_ms = analysis.get("sampling_interval_ms")
    nominal_step = nominal_ms / 1000.0 if isinstance(nominal_ms, (int, float)) and nominal_ms > 0 else None
    sample_gaps = []
    for (previous_t, _), (current_t, _) in zip(selected, selected[1:]):
        if nominal_step is not None and current_t - previous_t > nominal_step * 1.5:
            sample_gaps.append({"start_seconds": round(previous_t, 3), "end_seconds": round(current_t, 3),
                                "gap_seconds": round(current_t - previous_t, 3)})
    return {"samples": samples, "total_samples": total, "valid_samples": len(values),
            "coverage": round(len(values) / total, 3) if total else 0.0,
            "aggregations": aggregates, "time_basis": analysis["timestamp_mode"],
            "sample_gaps": sample_gaps}
