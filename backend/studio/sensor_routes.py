"""Coach-owned, bounded sensor metadata and offline sample import endpoints."""
import csv
import datetime as dt
import io
import json
import math
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.models import Athlete, Device, Membership, Practice, Team
from studio.sensor_math import analyze_elbow_series
from studio.sensor_models import SensorCalibration, SensorCaptureSession, SensorDeviceProtocol

router = APIRouter(prefix="/studio/sensors", tags=["Sensor protocol"])
MAX_IMPORT_BYTES = 1_000_000
MAX_SAMPLES = 1000
CAPABILITIES = {"orientation_quaternion", "timestamp"}


class ProtocolInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    athlete_id: uuid.UUID
    capabilities: list[str] = Field(min_length=1, max_length=8)
    firmware_version: str | None = Field(default=None, max_length=80)
    timebase: Literal["host_monotonic", "device_monotonic", "utc"] = "host_monotonic"
    metadata: dict = Field(default_factory=dict)


class CaptureInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    athlete_id: uuid.UUID
    practice_id: uuid.UUID | None = None
    upper_device_id: uuid.UUID
    forearm_device_id: uuid.UUID
    calibration_id: uuid.UUID


class CalibrationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    athlete_id: uuid.UUID
    upper_device_id: uuid.UUID
    forearm_device_id: uuid.UUID
    upper_sensor_to_segment_q: list[float] = Field(min_length=4, max_length=4)
    forearm_sensor_to_segment_q: list[float] = Field(min_length=4, max_length=4)
    neutral_relative_q: list[float] = Field(min_length=4, max_length=4)
    timestamp_provenance: dict = Field(min_length=1)
    notes: str = Field(default="", max_length=1000)


def _coach_athlete(db: Session, user: User, athlete_id: uuid.UUID) -> Athlete:
    access.coach(db, user)
    athlete = access.athlete(db, user, athlete_id)
    roster = db.scalar(
        select(Membership.id).join(Team, Team.id == Membership.team_id).where(
            Membership.athlete_id == athlete.id, Membership.active.is_(True),
            Team.owner_id == user.id, Team.archived.is_(False)
        ).limit(1)
    )
    if athlete.creator_id != user.id and roster is None:
        raise HTTPException(404, "Athlete is not managed by this coach.")
    return athlete


def _owned_imu(db: Session, user: User, device_id: uuid.UUID, athlete_id: uuid.UUID) -> Device:
    device = db.get(Device, device_id)
    if device is None or device.owner_id != user.id or device.kind != "imu" or device.athlete_id != athlete_id:
        raise HTTPException(404, "Assigned IMU device not found.")
    return device


def _finite_quaternion(value):
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return False
    try:
        values = [float(v) for v in value]
    except (TypeError, ValueError):
        return False
    if not all(math.isfinite(v) for v in values):
        return False
    norm = math.sqrt(sum(v * v for v in values))
    return 0.85 <= norm <= 1.15


def _parse_json_samples(raw: bytes):
    value = json.loads(raw)
    if isinstance(value, dict):
        samples = value.get("samples")
    else:
        samples = value
    if not isinstance(samples, list) or not 1 <= len(samples) <= MAX_SAMPLES:
        raise ValueError(f"JSON must contain 1 to {MAX_SAMPLES} paired samples.")
    return samples


def _parse_csv_samples(raw: bytes):
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    required = {"upper_ts_s", "forearm_ts_s", "upper_qw", "upper_qx", "upper_qy", "upper_qz",
                "forearm_qw", "forearm_qx", "forearm_qy", "forearm_qz"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise ValueError("CSV is missing required paired timestamp and quaternion columns.")
    samples = []
    for row in reader:
        if len(samples) >= MAX_SAMPLES:
            raise ValueError(f"CSV may contain at most {MAX_SAMPLES} samples.")
        samples.append({"upper_ts_s": row["upper_ts_s"], "forearm_ts_s": row["forearm_ts_s"],
            "upper_q": [row[f"upper_q{axis}"] for axis in "wxyz"],
            "forearm_q": [row[f"forearm_q{axis}"] for axis in "wxyz"],
            "attachment_changed": row.get("attachment_changed", "").strip().lower() == "true"})
    if not samples:
        raise ValueError("CSV contains no samples.")
    return samples


def _validate_samples(samples):
    cleaned = []
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"Sample {index + 1} must be an object.")
        def timestamp(key, row=sample):
            try:
                value = float(row[key])
                return value if math.isfinite(value) else None
            except (KeyError, TypeError, ValueError):
                return None

        upper_ts, forearm_ts = timestamp("upper_ts_s"), timestamp("forearm_ts_s")
        upper_q, forearm_q = sample.get("upper_q"), sample.get("forearm_q")
        upper_q = [float(v) for v in upper_q] if _finite_quaternion(upper_q) else None
        forearm_q = [float(v) for v in forearm_q] if _finite_quaternion(forearm_q) else None
        attachment_changed = sample.get("attachment_changed", False)
        if not isinstance(attachment_changed, bool):
            raise ValueError(f"Sample {index + 1} attachment_changed must be a boolean.")
        cleaned.append({"upper_ts_s": upper_ts, "forearm_ts_s": forearm_ts,
            "upper_q": upper_q, "forearm_q": forearm_q,
            "attachment_changed": attachment_changed})
    return cleaned


@router.put("/devices/{device_id}/protocol")
def configure_device(device_id: uuid.UUID, body: ProtocolInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _coach_athlete(db, user, body.athlete_id)
    device = db.get(Device, device_id)
    if device is None or device.owner_id != user.id or device.kind != "imu":
        raise HTTPException(404, "Coach-owned IMU device not found.")
    if device.athlete_id not in (None, body.athlete_id):
        raise HTTPException(409, "Device is already associated with another athlete.")
    device.athlete_id = body.athlete_id
    if any(capability not in CAPABILITIES for capability in body.capabilities):
        raise HTTPException(422, "Unsupported protocol capability.")
    try:
        metadata_size = len(json.dumps(body.metadata, allow_nan=False).encode("utf-8"))
    except (TypeError, ValueError):
        raise HTTPException(422, "Protocol metadata must be finite JSON data.") from None
    if metadata_size > 4000:
        raise HTTPException(422, "Protocol metadata is limited to 4 KB.")
    item = db.scalar(select(SensorDeviceProtocol).where(SensorDeviceProtocol.device_id == device_id))
    if item is None:
        item = SensorDeviceProtocol(device_id=device_id, coach_id=user.id, athlete_id=body.athlete_id)
        db.add(item)
    elif item.coach_id != user.id or item.athlete_id != body.athlete_id:
        raise HTTPException(409, "Device protocol association belongs to another athlete.")
    item.capabilities = body.capabilities
    item.firmware_version = body.firmware_version
    item.timebase = body.timebase
    item.metadata_json = body.metadata
    db.flush()
    return {"id": item.id, "device_id": item.device_id, "athlete_id": item.athlete_id,
            "capabilities": item.capabilities, "firmware_version": item.firmware_version,
            "timebase": item.timebase, "connection_status": "not_connected"}


@router.post("/captures", status_code=201)
def create_capture(body: CaptureInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _coach_athlete(db, user, body.athlete_id)
    _owned_imu(db, user, body.upper_device_id, body.athlete_id)
    _owned_imu(db, user, body.forearm_device_id, body.athlete_id)
    if body.upper_device_id == body.forearm_device_id:
        raise HTTPException(422, "Capture requires two distinct IMU devices.")
    protocols = db.scalars(select(SensorDeviceProtocol).where(
        SensorDeviceProtocol.device_id.in_([body.upper_device_id, body.forearm_device_id]),
        SensorDeviceProtocol.coach_id == user.id, SensorDeviceProtocol.athlete_id == body.athlete_id)).all()
    if len(protocols) != 2 or any("orientation_quaternion" not in protocol.capabilities for protocol in protocols):
        raise HTTPException(409, "Both assigned IMUs need orientation protocol metadata.")
    calibration = db.scalar(select(SensorCalibration).where(
        SensorCalibration.id == body.calibration_id,
        SensorCalibration.coach_id == user.id, SensorCalibration.athlete_id == body.athlete_id,
        SensorCalibration.upper_device_id == body.upper_device_id,
        SensorCalibration.forearm_device_id == body.forearm_device_id))
    if calibration is None:
        raise HTTPException(409, "Record calibration for this exact device pair before capture import.")
    if body.practice_id:
        practice = db.get(Practice, body.practice_id)
        is_member = practice and db.scalar(select(Membership.id).where(
            Membership.team_id == practice.team_id, Membership.athlete_id == body.athlete_id,
            Membership.active.is_(True)).limit(1))
        if practice is None or practice.owner_id != user.id or not is_member:
            raise HTTPException(404, "Practice or active athlete membership not found.")
    capture = SensorCaptureSession(coach_id=user.id, athlete_id=body.athlete_id, practice_id=body.practice_id,
        upper_device_id=body.upper_device_id, forearm_device_id=body.forearm_device_id,
        calibration_id=calibration.id)
    db.add(capture)
    db.flush()
    return {"id": capture.id, "status": capture.status, "sample_count": 0, "connection_status": "not_connected"}


@router.post("/captures/{capture_id}/import")
async def import_capture(capture_id: uuid.UUID, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    capture = db.get(SensorCaptureSession, capture_id)
    if capture is None or capture.coach_id != user.id:
        raise HTTPException(404, "Capture not found.")
    _coach_athlete(db, user, capture.athlete_id)
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    await file.close()
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "Sensor import is limited to 1 MB.")
    filename = (file.filename or "").lower()
    try:
        if filename.endswith(".json"):
            source_format, samples = "json", _parse_json_samples(raw)
        elif filename.endswith(".csv"):
            source_format, samples = "csv", _parse_csv_samples(raw)
        else:
            raise ValueError("Choose a CSV or JSON sample file.")
        samples = _validate_samples(samples)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    capture.samples = samples
    capture.sample_count = len(samples)
    capture.source_format = source_format
    capture.status = "imported"
    capture.imported_at = dt.datetime.now(dt.UTC)
    capture.provenance = {"method": "user_file_import", "filename": file.filename or "", "live_connection": False}
    db.flush()
    return {"id": capture.id, "status": capture.status, "sample_count": capture.sample_count,
            "source_format": source_format, "live_connection": False}


@router.post("/calibrations", status_code=201)
def create_calibration(body: CalibrationInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _coach_athlete(db, user, body.athlete_id)
    upper = _owned_imu(db, user, body.upper_device_id, body.athlete_id)
    forearm = _owned_imu(db, user, body.forearm_device_id, body.athlete_id)
    if upper.id == forearm.id:
        raise HTTPException(422, "Choose two distinct assigned IMU devices.")
    protocols = db.scalars(select(SensorDeviceProtocol).where(
        SensorDeviceProtocol.device_id.in_([upper.id, forearm.id]),
        SensorDeviceProtocol.coach_id == user.id, SensorDeviceProtocol.athlete_id == body.athlete_id)).all()
    if len(protocols) != 2:
        raise HTTPException(409, "Configure both devices for this athlete before calibration.")
    if any(not _finite_quaternion(q) for q in (body.upper_sensor_to_segment_q,
            body.forearm_sensor_to_segment_q, body.neutral_relative_q)):
        raise HTTPException(422, "Calibration quaternions must be finite and near unit length.")
    try:
        provenance_size = len(json.dumps(body.timestamp_provenance, allow_nan=False).encode("utf-8"))
    except (TypeError, ValueError):
        raise HTTPException(422, "Timestamp provenance must be finite JSON data.") from None
    if provenance_size > 4000:
        raise HTTPException(422, "Timestamp provenance is limited to 4 KB.")
    item = SensorCalibration(coach_id=user.id, athlete_id=body.athlete_id,
        upper_device_id=upper.id, forearm_device_id=forearm.id,
        segment_orientation={"upper_sensor_to_segment_q": body.upper_sensor_to_segment_q,
            "forearm_sensor_to_segment_q": body.forearm_sensor_to_segment_q},
        timestamp_provenance=body.timestamp_provenance,
        calibration_samples={"neutral_relative_q": body.neutral_relative_q}, notes=body.notes)
    db.add(item)
    db.flush()
    return {"id": item.id, "athlete_id": item.athlete_id, "created_at": item.created_at,
            "status": "calibration_recorded", "accuracy_claim": None}


@router.get("/captures/{capture_id}/elbow")
def capture_elbow(capture_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    capture = db.get(SensorCaptureSession, capture_id)
    if capture is None or capture.coach_id != user.id:
        raise HTTPException(404, "Capture not found.")
    _coach_athlete(db, user, capture.athlete_id)
    calibration = db.get(SensorCalibration, capture.calibration_id) if capture.calibration_id else None
    if calibration is None:
        raise HTTPException(409, "Record paired sensor calibration before computing relative elbow orientation.")
    full_calibration = {**calibration.segment_orientation, **calibration.calibration_samples}
    return {"capture_id": capture.id, "method": "relative_quaternion_change_from_neutral",
        "results": analyze_elbow_series(capture.samples, full_calibration),
        "interpretation": "Relative orientation prototype; not a validated anatomical angle."}
