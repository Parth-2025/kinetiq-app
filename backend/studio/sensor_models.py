"""Bounded, file-import based protocol records for future coach sensor kits.

These records intentionally describe protocol metadata only. They do not imply a
live radio connection or validated hardware performance.
"""
import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models import Base


class SensorDeviceProtocol(Base):
    __tablename__ = "studio_sensor_device_protocols"
    __table_args__ = (UniqueConstraint("device_id", name="uq_sensor_protocol_device"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_devices.id", ondelete="CASCADE"), index=True)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    capabilities: Mapped[list] = mapped_column(JSONB, default=list)
    firmware_version: Mapped[str | None] = mapped_column(String(80))
    timebase: Mapped[str] = mapped_column(String(40), default="host_monotonic")
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"))


class SensorCaptureSession(Base):
    __tablename__ = "studio_sensor_capture_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    practice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_practices.id", ondelete="SET NULL"), index=True)
    upper_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_devices.id", ondelete="SET NULL"))
    forearm_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_devices.id", ondelete="SET NULL"))
    calibration_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_sensor_calibrations.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), default="created")
    source_format: Mapped[str | None] = mapped_column(String(12))
    sample_count: Mapped[int] = mapped_column(default=0)
    samples: Mapped[list] = mapped_column(JSONB, default=list)
    provenance: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    imported_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class SensorCalibration(Base):
    __tablename__ = "studio_sensor_calibrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    upper_device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_devices.id", ondelete="CASCADE"))
    forearm_device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_devices.id", ondelete="CASCADE"))
    segment_orientation: Mapped[dict] = mapped_column(JSONB)
    timestamp_provenance: Mapped[dict] = mapped_column(JSONB)
    calibration_samples: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    notes: Mapped[str] = mapped_column(Text, default="")
