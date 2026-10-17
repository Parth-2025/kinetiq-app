"""Private single-camera tracking jobs and coach-reviewed identity links."""
import datetime as dt
import uuid
from sqlalchemy import DateTime, ForeignKey, JSON, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from db.models import Base


class PracticeTrackingJob(Base):
    __tablename__ = "studio_practice_tracking_jobs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    practice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_practices.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_practice_camera_sources.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    result: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    links: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False)
