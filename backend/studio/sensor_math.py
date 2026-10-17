"""Conservative quaternion math for paired, calibrated IMU samples.

Angles are relative orientation changes from a supplied neutral calibration. They
are protocol outputs, not validated anatomical measurements.
"""
from __future__ import annotations

import math
from typing import Any


def _unit(q: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(q, (list, tuple)) or len(q) != 4:
        return None
    try:
        values = tuple(float(value) for value in q)
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(value) for value in values):
        return None
    norm = math.sqrt(sum(value * value for value in values))
    if norm < 1e-8 or abs(norm - 1.0) > 0.15:
        return None
    return tuple(value / norm for value in values)


def _multiply(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    )


def _inverse(q):
    return (q[0], -q[1], -q[2], -q[3])


def _relative(upper, forearm):
    return _multiply(_inverse(upper), forearm)


def relative_elbow_angle_deg(sample: dict, calibration: dict, *, max_pair_skew_ms: float = 20) -> dict:
    """Return a bounded relative elbow orientation change, or a null result.

    Required sample fields: upper_ts_s, forearm_ts_s, upper_q, forearm_q.
    Calibration stores sensor_to_segment quaternions and a neutral_relative_q,
    all in [w, x, y, z] order. Pair timestamp skew is a quality gate.
    """
    if sample.get("attachment_changed"):
        return {"angle_deg": None, "quality": "attachment_changed"}
    try:
        upper_ts, forearm_ts = float(sample["upper_ts_s"]), float(sample["forearm_ts_s"])
    except (KeyError, TypeError, ValueError):
        return {"angle_deg": None, "quality": "missing_timestamp"}
    if not math.isfinite(upper_ts) or not math.isfinite(forearm_ts):
        return {"angle_deg": None, "quality": "nonfinite_timestamp"}
    skew_ms = abs(upper_ts - forearm_ts) * 1000
    if skew_ms > max_pair_skew_ms:
        return {"angle_deg": None, "quality": "timestamp_skew"}
    upper_raw, forearm_raw = _unit(sample.get("upper_q")), _unit(sample.get("forearm_q"))
    upper_mount = _unit(calibration.get("upper_sensor_to_segment_q"))
    forearm_mount = _unit(calibration.get("forearm_sensor_to_segment_q"))
    neutral = _unit(calibration.get("neutral_relative_q"))
    if any(value is None for value in (upper_raw, forearm_raw, upper_mount, forearm_mount, neutral)):
        return {"angle_deg": None, "quality": "invalid_quaternion"}
    upper_segment = _multiply(upper_raw, upper_mount)
    forearm_segment = _multiply(forearm_raw, forearm_mount)
    relative = _relative(upper_segment, forearm_segment)
    delta = _multiply(_inverse(neutral), relative)
    # q and -q represent the same rotation; choosing w >= 0 gives the shortest arc.
    if delta[0] < 0:
        delta = tuple(-value for value in delta)
    angle = math.degrees(2 * math.acos(max(-1.0, min(1.0, delta[0]))))
    if not math.isfinite(angle) or angle > 180:
        return {"angle_deg": None, "quality": "invalid_angle"}
    return {"angle_deg": round(angle, 2), "quality": "relative_orientation", "pair_skew_ms": round(skew_ms, 3)}


def analyze_elbow_series(samples: list[dict], calibration: dict, *, max_pair_skew_ms: float = 20,
                         max_gap_s: float = 0.2, max_clock_drift_ms: float = 10) -> list[dict]:
    """Apply timestamp continuity gates before evaluating each paired sample."""
    results = []
    previous_ts = None
    previous_offset = None
    for sample in samples:
        try:
            ts = (float(sample["upper_ts_s"]) + float(sample["forearm_ts_s"])) / 2
        except (KeyError, TypeError, ValueError):
            results.append({"angle_deg": None, "quality": "missing_timestamp"})
            previous_ts = None
            previous_offset = None
            continue
        if not math.isfinite(ts):
            results.append({"angle_deg": None, "quality": "nonfinite_timestamp"})
            previous_ts = None
            previous_offset = None
            continue
        try:
            offset = (float(sample["upper_ts_s"]) - float(sample["forearm_ts_s"])) * 1000
        except (KeyError, TypeError, ValueError):
            offset = float("nan")
        if not math.isfinite(offset):
            results.append({"angle_deg": None, "quality": "nonfinite_timestamp"})
            previous_ts = None
            previous_offset = None
            continue
        if previous_ts is not None and (ts <= previous_ts or ts - previous_ts > max_gap_s):
            results.append({"angle_deg": None, "quality": "timestamp_discontinuity"})
            previous_ts = ts
            previous_offset = offset
            continue
        if previous_offset is not None and abs(offset - previous_offset) > max_clock_drift_ms:
            results.append({"angle_deg": None, "quality": "clock_drift"})
            previous_ts = ts
            previous_offset = offset
            continue
        results.append(relative_elbow_angle_deg(sample, calibration, max_pair_skew_ms=max_pair_skew_ms))
        previous_ts = ts
        previous_offset = offset
    return results
