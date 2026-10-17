"""Persisted athlete completion state for written assignments."""
import datetime as dt
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models import Base


class AssignmentCompletion(Base):
    __tablename__ = "studio_assignment_completions"
    __table_args__ = (UniqueConstraint("assignment_id", "athlete_id", name="uq_studio_assignment_completion"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_assignments.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False)
