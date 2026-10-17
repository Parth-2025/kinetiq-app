"""Experimental private multi-camera capture setup for coach-owned practices."""
import math
import secrets
import uuid

import cv2
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from settings import settings
from studio.access import audit, coach
from studio.models import Practice
from studio.practice_capture_models import PracticeCameraSource

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


class SourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=80)
    camera_position: str = Field(default="unspecified", max_length=40)
    orientation_degrees: int = Field(default=0, ge=0, le=359)


class CalibrationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    court_width: float = Field(gt=0, le=100)
    court_length: float = Field(gt=0, le=200)
    landmarks: list[tuple[float, float, float, float]] = Field(min_length=4, max_length=64)
    reprojection_error: float | None = Field(default=None, ge=0, le=10000)


class SyncInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: str
    offset_seconds: float = Field(ge=-86400, le=86400)
    uncertainty_seconds: float = Field(ge=0, le=3600)
    evidence: str = Field(min_length=1, max_length=500)


def _practice(db, user, practice_id):
    coach(db, user)
    practice = db.get(Practice, practice_id)
    if practice is None or practice.owner_id != user.id:
        raise HTTPException(404, "Practice not found.")
    return practice


def _source(db, user, practice_id, source_id, lock=False):
    _practice(db, user, practice_id)
    query = select(PracticeCameraSource).where(PracticeCameraSource.id == source_id,
        PracticeCameraSource.practice_id == practice_id, PracticeCameraSource.owner_id == user.id)
    if lock:
        query = query.with_for_update()
    item = db.scalar(query)
    if item is None:
        raise HTTPException(404, "Camera source not found.")
    return item


def _view(item):
    return {"id": str(item.id), "practice_id": str(item.practice_id), "label": item.label,
        "camera_position": item.camera_position, "orientation_degrees": item.orientation_degrees,
        "duration_seconds": item.duration_seconds, "bytes": item.bytes,
        "original_filename": item.original_filename, "uploaded": bool(item.media_path),
        "status": item.status, "calibration": item.calibration,
        "synchronization": item.synchronization,
        "retention": "Private footage remains stored until the coach removes this camera source.",
        "provenance": "Coach-uploaded source footage; no player tracking or metrics are generated."}


def _area_nonzero(points, x_index, y_index):
    pairs = [(p[x_index], p[y_index]) for p in points]
    return any(abs((pairs[i][0]-pairs[0][0])*(pairs[j][1]-pairs[0][1]) - (pairs[i][1]-pairs[0][1])*(pairs[j][0]-pairs[0][0])) > 1e-8
        for i in range(1, len(pairs)) for j in range(i+1, len(pairs)))


def _solve(matrix, values):
    """Small pivoted Gauss-Jordan solve for an 8-parameter planar homography."""
    rows = [list(row) + [value] for row, value in zip(matrix, values)]
    for col in range(8):
        pivot = max(range(col, 8), key=lambda row: abs(rows[row][col]))
        if abs(rows[pivot][col]) < 1e-12:
            raise ValueError("degenerate landmarks")
        rows[col], rows[pivot] = rows[pivot], rows[col]
        scale = rows[col][col]
        rows[col] = [v / scale for v in rows[col]]
        for row in range(8):
            if row != col:
                scale = rows[row][col]
                rows[row] = [a - scale*b for a, b in zip(rows[row], rows[col])]
    return [rows[i][8] for i in range(8)]


@router.get("/practices/{practice_id}/camera-sources")
def list_sources(practice_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _practice(db, user, practice_id)
    rows = db.scalars(select(PracticeCameraSource).where(PracticeCameraSource.practice_id == practice_id,
        PracticeCameraSource.owner_id == user.id).order_by(PracticeCameraSource.created_at)).all()
    calibrated_synced = [s for s in rows if s.media_path and s.duration_seconds and s.calibration.get("status") == "calibrated" and s.synchronization.get("status") == "evidence_recorded"]
    return {"sources": [_view(row) for row in rows],
        "review_status": "evidence_recorded" if len(calibrated_synced) >= 2 else "setup_incomplete",
        "review_note": "Two or more sources have decodable video files, measured durations, and coach-entered calibration and synchronization evidence. Court geometry and synchronization accuracy are not independently validated; no player measurements are produced."}


@router.post("/practices/{practice_id}/camera-sources", status_code=201)
def add_source(practice_id: uuid.UUID, body: SourceInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _practice(db, user, practice_id)
    db.execute(select(Practice.id).where(Practice.id == practice_id).with_for_update()).first()
    count = len(db.scalars(select(PracticeCameraSource.id).where(PracticeCameraSource.practice_id == practice_id)).all())
    if count >= 3:
        raise HTTPException(409, "A practice can have up to three camera sources.")
    item = PracticeCameraSource(practice_id=practice_id, owner_id=user.id, **body.model_dump())
    db.add(item)
    db.flush()
    audit(db, user, "practice.camera_source_added", item.id)
    return _view(item)


@router.post("/practices/{practice_id}/camera-sources/{source_id}/video", status_code=201)
async def upload_source(practice_id: uuid.UUID, source_id: uuid.UUID, duration_seconds: float,
    video: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not math.isfinite(duration_seconds) or duration_seconds <= 0 or duration_seconds > 6 * 3600:
        raise HTTPException(422, "Provide a clip duration between 0 and 6 hours.")
    item = _source(db, user, practice_id, source_id, lock=True)
    if item.media_path:
        raise HTTPException(409, "Remove this source before uploading replacement footage; this preserves its evidence provenance.")
    if video.content_type and video.content_type not in ("application/octet-stream",) and not video.content_type.startswith("video/"):
        raise HTTPException(415, "Choose a video file.")
    root = settings.studio_media_dir / "practice-capture" / str(practice_id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{item.id}.video"
    temporary = root / f"{item.id}.{secrets.token_hex(6)}.upload"
    total = 0
    try:
        with temporary.open("wb") as stream:
            while chunk := await video.read(1024 * 1024):
                total += len(chunk)
                if total > settings.studio_upload_limit_mb * 1024 * 1024:
                    raise HTTPException(413, f"Choose a clip smaller than {settings.studio_upload_limit_mb} MB.")
                stream.write(chunk)
        if not total:
            raise HTTPException(400, "The recording is empty.")
        capture = cv2.VideoCapture(str(temporary))
        try:
            decoded, frame = capture.read()
            fps = capture.get(cv2.CAP_PROP_FPS)
            frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
            measured_duration = frames / fps if fps > 0 else 0
            if not decoded or frame is None or not math.isfinite(measured_duration) or measured_duration <= 0:
                raise HTTPException(415, "The file must contain a decodable video with a measurable duration.")
            if measured_duration > 6 * 3600:
                raise HTTPException(422, "Choose a clip no longer than 6 hours.")
            if abs(measured_duration - duration_seconds) > max(1, measured_duration * 0.05):
                raise HTTPException(422, "The supplied duration does not match the video duration.")
        finally:
            capture.release()
        temporary.replace(path)
        item.media_path = str(path)
        item.duration_seconds = measured_duration
        item.bytes = total
        item.original_filename = (video.filename or "recording")[:160]
        item.status = "uploaded"
        item.calibration = {}
        item.synchronization = {}
        db.flush()
        audit(db, user, "practice.camera_source_uploaded", item.id, {"bytes": total, "duration_seconds": measured_duration})
        return _view(item)
    finally:
        temporary.unlink(missing_ok=True)
        await video.close()


@router.put("/practices/{practice_id}/camera-sources/{source_id}/calibration")
def calibrate(practice_id: uuid.UUID, source_id: uuid.UUID, body: CalibrationInput,
    user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = _source(db, user, practice_id, source_id, lock=True)
    points = body.landmarks
    if not all(math.isfinite(v) for v in (body.court_width, body.court_length)):
        raise HTTPException(422, "Court dimensions must be finite.")
    if not _area_nonzero(points, 0, 1) or not _area_nonzero(points, 2, 3):
        raise HTTPException(422, "Choose at least four noncollinear points in both image and court coordinates.")
    if any(not all(math.isfinite(v) for v in p) or p[2] < 0 or p[2] > body.court_width or p[3] < 0 or p[3] > body.court_length for p in points):
        raise HTTPException(422, "Court landmark coordinates must fall within the stated court dimensions.")
    matrix, values = [], []
    for x, y, u, v in points[:4]:
        matrix.extend(([x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]))
        values.extend((u, v))
    try:
        h = _solve(matrix, values)
        errors = []
        for x, y, u, v in points:
            den = h[6]*x + h[7]*y + 1
            if abs(den) < 1e-12:
                raise ValueError("invalid projection")
            px, py = (h[0]*x+h[1]*y+h[2])/den, (h[3]*x+h[4]*y+h[5])/den
            errors.append(math.hypot(px-u, py-v))
    except (ValueError, ZeroDivisionError):
        raise HTTPException(422, "These landmarks do not define a stable planar calibration.")
    computed_error = sum(errors) / len(errors)
    if not math.isfinite(computed_error):
        raise HTTPException(422, "These landmarks do not define a finite calibration.")
    normalized_error = computed_error / math.hypot(body.court_width, body.court_length)
    if normalized_error > 0.05:
        raise HTTPException(422, "Landmark reprojection error is too large; review the selected court points.")
    item.calibration = {**body.model_dump(), "status": "calibrated", "method": "coach_entered_planar_homography",
        "computed_mean_reprojection_error": computed_error, "normalized_reprojection_error": normalized_error,
        "accuracy_claim": "A planar homography fit the supplied landmarks; this does not establish real-world measurement accuracy."}
    db.flush()
    return _view(item)


@router.put("/practices/{practice_id}/camera-sources/{source_id}/synchronization")
def synchronize(practice_id: uuid.UUID, source_id: uuid.UUID, body: SyncInput,
    user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.method not in {"manual", "source"}:
        raise HTTPException(422, "Synchronization method must be manual or source.")
    item = _source(db, user, practice_id, source_id, lock=True)
    status = "evidence_recorded"
    item.synchronization = {**body.model_dump(), "status": status,
        "accuracy_claim": "Offset and uncertainty are recorded evidence; synchronization accuracy is not independently verified."}
    db.flush()
    return _view(item)


@router.delete("/practices/{practice_id}/camera-sources/{source_id}")
def delete_source(practice_id: uuid.UUID, source_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = _source(db, user, practice_id, source_id, lock=True)
    if item.media_path:
        Path(item.media_path).unlink(missing_ok=True)
    audit(db, user, "practice.camera_source_deleted", item.id)
    db.delete(item)
    return {"deleted": True}
