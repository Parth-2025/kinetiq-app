"""Deterministic display-only fixed-length rig fitting from canonical motion."""
from __future__ import annotations

import math
import statistics
from typing import Any

from .motion_contract import CanonicalMotionSession


ALGORITHM_VERSION = "median_lengths_v1"
TOPOLOGY_VERSION = "body17_v1"
MAX_FRAMES = 1000
MIN_LENGTH_M = 1e-6
MAX_LENGTH_M = 5.0  # Numerical guard only; this is not a population plausibility bound.

# name, parent index, source joint mapping, canonical display direction
_TOPOLOGY = (
    ("pelvis", None, (23, 24), None),
    ("shoulder_center", 0, (11, 12), (0, 1, 0)),
    ("left_hip", 0, (23,), (1, 0, 0)),
    ("right_hip", 0, (24,), (-1, 0, 0)),
    ("left_shoulder", 1, (11,), (1, 0, 0)),
    ("right_shoulder", 1, (12,), (-1, 0, 0)),
    ("left_elbow", 4, (13,), (1, 0, 0)),
    ("right_elbow", 5, (14,), (-1, 0, 0)),
    ("left_wrist", 6, (15,), (1, 0, 0)),
    ("right_wrist", 7, (16,), (-1, 0, 0)),
    ("left_knee", 2, (25,), (0, -1, 0)),
    ("right_knee", 3, (26,), (0, -1, 0)),
    ("left_ankle", 10, (27,), (0, -1, 0)),
    ("right_ankle", 11, (28,), (0, -1, 0)),
    ("left_foot", 12, (31,), (0, 0, 1)),
    ("right_foot", 13, (32,), (0, 0, 1)),
    ("head_proxy", 1, (0,), (0, 1, 0)),
)


def _midpoint(points: list[list[float] | None], indices: tuple[int, ...]):
    found = [points[i] for i in indices if points[i] is not None]
    if len(found) != len(indices):
        return None
    if len(found) == 1:
        return list(found[0])
    return [sum(p[axis] for p in found) / len(found) for axis in range(3)]


def _raw_points(frame):
    return [_midpoint(frame.positions_m, entry[2]) for entry in _TOPOLOGY]


def _vector(a, b):
    return [b[i] - a[i] for i in range(3)]


def _norm(v):
    return math.sqrt(sum(x * x for x in v))


def _source_digest(motion: CanonicalMotionSession) -> str:
    """Return the raw retained-analysis digest carried through canonical adaptation."""
    return motion.reconstruction_revision_sha256


def _measurement_context(values: dict | None) -> dict:
    if not isinstance(values, dict):
        return {}
    return {key: values[key] for key in ("height_cm", "wingspan_cm", "provenance") if key in values}


def build_display_rig(motion: CanonicalMotionSession, measurement_values: dict | None = None) -> dict:
    """Build a conservative fixed-length presentation rig; never modifies analysis data."""
    if len(motion.frames) > MAX_FRAMES:
        raise ValueError(f"display rig supports at most {MAX_FRAMES} frames")

    # No-pose and multi-person frames cannot contribute to fitting or display.
    eligible = [f for f in motion.frames if f.quality in {"usable", "partial_body_or_occlusion"}]
    raw_by_frame = [_raw_points(frame) for frame in motion.frames]
    lengths: list[float | None] = [None] * len(_TOPOLOGY)
    supports = [0] * len(_TOPOLOGY)
    for index, (_, parent, _, _) in enumerate(_TOPOLOGY):
        if parent is None:
            supports[index] = sum(points[0] is not None for f, points in zip(motion.frames, raw_by_frame)
                                  if f.quality in {"usable", "partial_body_or_occlusion"})
            continue
        observations = []
        for frame, points in zip(motion.frames, raw_by_frame):
            if frame.quality not in {"usable", "partial_body_or_occlusion"} or points[index] is None or points[parent] is None:
                continue
            distance = _norm(_vector(points[parent], points[index]))
            if math.isfinite(distance) and MIN_LENGTH_M <= distance <= MAX_LENGTH_M:
                observations.append(distance)
        supports[index] = len(observations)
        if len(observations) >= 3:
            lengths[index] = float(statistics.median(observations))

    joints = []
    rest_positions: list[list[float] | None] = []
    for index, (name, parent, sources, direction) in enumerate(_TOPOLOGY):
        source_index = sources[0] if len(sources) == 1 else None
        if index == 0:
            rest = [0.0, 0.0, 0.0] if supports[0] else None
            length = None
        elif lengths[index] is None or rest_positions[parent] is None:
            rest, length = None, lengths[index]
        else:
            rest = [rest_positions[parent][axis] + direction[axis] * lengths[index] for axis in range(3)]
            length = lengths[index]
        rest_positions.append(rest)
        joints.append({"name": name, "parent": parent, "source_joint_index": source_index,
                       "rest_position_m": rest, "length_m": length, "support_samples": supports[index]})

    output_frames = []
    root_supported = False
    for frame, raw in zip(motion.frames, raw_by_frame):
        positions: list[list[float] | None] = [None] * len(_TOPOLOGY)
        if frame.quality in {"usable", "partial_body_or_occlusion"} and raw[0] is not None:
            positions[0] = [0.0, 0.0, 0.0]
            root_supported = True
            for index, (_, parent, _, _) in enumerate(_TOPOLOGY[1:], start=1):
                if lengths[index] is None or positions[parent] is None or raw[index] is None or raw[parent] is None:
                    continue
                observed = _vector(raw[parent], raw[index])
                magnitude = _norm(observed)
                if not math.isfinite(magnitude) or magnitude < MIN_LENGTH_M or magnitude > MAX_LENGTH_M:
                    continue
                positions[index] = [positions[parent][axis] + observed[axis] / magnitude * lengths[index]
                                    for axis in range(3)]
        output_frames.append({"sample_index": frame.sample_index, "time_s": frame.time_s,
                              "quality": frame.quality, "positions_m": positions})

    supported_segments = sum(value is not None for value in rest_positions[1:])
    status = "unsupported" if not root_supported or supported_segments == 0 else (
        "available" if supported_segments == len(rest_positions) - 1 else "partial")
    limitations = ["display-only model-estimated proportions; not a recovered body surface"]
    if status != "available":
        limitations.append("some rig segments lack three valid observations and remain hidden")
    if not root_supported:
        limitations.append("root requires both observed hips; no supported root is present")
    limitations.append("head_proxy follows the nose landmark and is not a skull center")

    return {
        "schema_version": "display_rig.v1", "algorithm_version": ALGORITHM_VERSION,
        "topology_version": TOPOLOGY_VERSION, "source_analysis_sha256": _source_digest(motion),
        "measurement_snapshot_id": str(motion.measurement_snapshot_id) if motion.measurement_snapshot_id else None,
        "measurement_context": _measurement_context(measurement_values), "measurement_usage": "context_only",
        "coordinate_convention": "kinetiq_rh_yup_v1", "scale_source": "model_estimated",
        "time_basis": motion.time_basis, "joints": joints, "frames": output_frames,
        "limitations": limitations, "status": status,
    }
