"""Validated canonical motion contract and adapter for the current Studio analyzer."""
from __future__ import annotations

import math
import hashlib
import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SCHEMA_VERSION = "motion_session.v1"
MAX_FRAMES = 1000
MAX_RECORD_BYTES = 8 * 1024 * 1024
QUALITY_VALUES = {"usable", "partial_body_or_occlusion", "no_pose", "multiple_people"}
JOINT_NAMES = (
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye",
    "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder",
    "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_pinky",
    "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb", "left_hip",
    "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel",
    "right_heel", "left_foot_index", "right_foot_index",
)


class CanonicalFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time_s: float = Field(ge=0, le=60)
    source_sample_id: str | None
    sample_index: int = Field(ge=0)
    decoded_frame_index: int | None = Field(default=None, ge=0)
    original_frame_index: int | None = Field(default=None, ge=0)
    quality: Literal["usable", "partial_body_or_occlusion", "no_pose", "multiple_people"]
    # Hip-relative positions in meters. Null means absent or visibility below the
    # source analyzer's 0.65 threshold; recorded visibility is retained as-is.
    positions_m: list[list[float] | None] = Field(min_length=33, max_length=33)
    visibility: list[float | None] = Field(min_length=33, max_length=33)

    @field_validator("time_s")
    @classmethod
    def finite_time(cls, value):
        if not math.isfinite(value):
            raise ValueError("time must be finite")
        return value

    @field_validator("positions_m")
    @classmethod
    def finite_positions(cls, values):
        for point in values:
            if point is not None and (len(point) != 3 or not all(math.isfinite(v) for v in point)):
                raise ValueError("positions must be finite 3D vectors or null")
        return values

    @field_validator("visibility")
    @classmethod
    def finite_visibility(cls, values):
        if any(v is not None and (not math.isfinite(v) or not 0 <= v <= 1) for v in values):
            raise ValueError("visibility must be between zero and one or null")
        return values


class MotionCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid")
    canonical_joint_positions: Literal[True] = True
    joint_visibility: Literal[True] = True
    joint_angles: Literal[False] = False
    mesh_reconstruction: Literal[False] = False
    root_trajectory: Literal[False] = False
    world_displacement: Literal[False] = False
    body_parameters: Literal[False] = False
    refit_from_rgb: Literal[False] = False


class CanonicalMotionSession(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["motion_session.v1"] = SCHEMA_VERSION
    session_id: UUID
    subject_athlete_id: UUID
    provider: Literal["mediapipe-heavy-world"]
    provider_version: str | None = None
    provider_model_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_record_version: str
    coordinate_convention: Literal["kinetiq_rh_yup_v1"] = "kinetiq_rh_yup_v1"
    source_coordinate_convention: Literal["mediapipe_world_hip_relative_meters"]
    coordinate_frame: Literal["hip_root_relative_model"] = "hip_root_relative_model"
    axis_convention: Literal["x_right_y_up_z_toward_camera"] = "x_right_y_up_z_toward_camera"
    units: Literal["meters"] = "meters"
    transform: Literal["x,-y,-z"] = "x,-y,-z"
    angle_convention: Literal["flexion_0_at_extension"] = "flexion_0_at_extension"
    time_basis: Literal["decoded_presentation_time", "nominal_fallback"]
    time_unit: Literal["seconds"] = "seconds"
    scale_source: Literal["model_estimated"] = "model_estimated"
    root_trajectory_available: Literal[False] = False
    source_retention: Literal["retained", "deleted", "unknown"]
    reconstruction_revision_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    measurement_snapshot_id: UUID | None = None
    joint_names: list[str] = Field(min_length=33, max_length=33)
    frames: list[CanonicalFrame] = Field(min_length=1, max_length=MAX_FRAMES)
    capabilities: MotionCapabilities = Field(default_factory=MotionCapabilities)

    @model_validator(mode="after")
    def valid_order(self):
        if self.joint_names != list(JOINT_NAMES):
            raise ValueError("joint names/order must match the declared skeleton")
        times = [frame.time_s for frame in self.frames]
        if any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError("frame timestamps must be strictly increasing")
        return self


def adapt_analysis(session_id: UUID, athlete_id: UUID, source: dict, analysis: dict,
                   measurement_id: UUID | None = None) -> CanonicalMotionSession | None:
    """Adapt only the exact supported MediaPipe record; unsupported legacy returns None."""
    if not isinstance(analysis, dict) or analysis.get("version") != "studio-motion-1":
        return None
    if analysis.get("coordinate_system") != "mediapipe_world_hip_relative_meters":
        return None
    if analysis.get("provider") != "mediapipe-heavy-world":
        return None
    if analysis.get("angle_convention") != "flexion_0_at_extension":
        return None
    raw_frames = analysis.get("frames")
    if not isinstance(raw_frames, list) or not 0 < len(raw_frames) <= MAX_FRAMES:
        return None
    frames = []
    try:
        for sample_index, raw in enumerate(raw_frames):
            if not isinstance(raw, dict):
                return None
            if raw.get("quality") not in QUALITY_VALUES:
                return None
            ms = raw.get("time_ms")
            if isinstance(ms, bool) or not isinstance(ms, (int, float)) or not math.isfinite(ms):
                return None
            raw_points = raw.get("points")
            if not isinstance(raw_points, list) or len(raw_points) != len(JOINT_NAMES):
                return None
            positions, visibility = [], []
            for point in raw_points:
                if point is None:
                    positions.append(None); visibility.append(None); continue
                if not isinstance(point, list) or len(point) != 4:
                    return None
                x, y, z, vis = point
                if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in point):
                    return None
                if not 0 <= vis <= 1:
                    return None
                if vis < 0.65:
                    positions.append(None); visibility.append(float(vis))
                else:
                    positions.append([float(x), -float(y), -float(z)])
                    visibility.append(float(vis))
            source_sample_id = raw.get("source_sample_id")
            if source_sample_id is not None and (not isinstance(source_sample_id, str) or len(source_sample_id) > 128):
                return None
            decoded_frame_index = raw.get("source_frame_index")
            if decoded_frame_index is not None and (type(decoded_frame_index) is not int or decoded_frame_index < 0):
                return None
            frames.append(CanonicalFrame(time_s=float(ms) / 1000, source_sample_id=source_sample_id,
                sample_index=sample_index, decoded_frame_index=decoded_frame_index,
                quality=raw["quality"], positions_m=positions, visibility=visibility))
        timestamp_mode = analysis.get("timestamp_mode")
        time_basis = {"decoded_presentation": "decoded_presentation_time",
                      "nominal_fallback": "nominal_fallback"}.get(timestamp_mode)
        if time_basis is None:
            return None
        digest = analysis.get("model_sha256")
        if not isinstance(digest, str):
            return None
        provider_version = analysis.get("provider_version")
        if provider_version is not None and (not isinstance(provider_version, str) or not provider_version or len(provider_version) > 100):
            return None
        retained = source.get("source_retained")
        retention = "retained" if retained is True else "deleted" if retained is False else "unknown"
        record_bytes = json.dumps(analysis, sort_keys=True, separators=(",", ":"),
            allow_nan=False).encode("utf-8")
        if len(record_bytes) > MAX_RECORD_BYTES:
            return None
        revision = hashlib.sha256(record_bytes).hexdigest()
        return CanonicalMotionSession(session_id=session_id, subject_athlete_id=athlete_id,
            provider="mediapipe-heavy-world", provider_version=provider_version,
            provider_model_sha256=digest, source_record_version=str(analysis.get("version")),
            source_coordinate_convention="mediapipe_world_hip_relative_meters", time_basis=time_basis,
            source_retention=retention, reconstruction_revision_sha256=revision,
            measurement_snapshot_id=measurement_id,
            joint_names=list(JOINT_NAMES), frames=frames)
    except (TypeError, ValueError):
        return None
