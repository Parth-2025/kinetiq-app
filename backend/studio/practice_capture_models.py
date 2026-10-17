"""Coach-managed private camera footage and evidence for practice review."""
import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from db.models import Base


class PracticeCameraSource(Base):
    __tablename__ = "studio_practice_camera_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    practice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_practices.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    camera_position: Mapped[str] = mapped_column(String(40), nullable=False, default="unspecified")
    orientation_degrees: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[float | None] = mapped_column(nullable=True)
    bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(160), nullable=True)
    media_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    calibration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synchronization: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="awaiting_upload")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False)
