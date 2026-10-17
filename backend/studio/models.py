"""Additive Studio schema. Account identity remains in db.models.User."""
import datetime as dt
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models import Base


class Record:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class StudioAccount(Base):
    __tablename__ = "studio_accounts"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), default="athlete")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)


class Athlete(Record, Base):
    __tablename__ = "studio_athletes"
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    sport: Mapped[str] = mapped_column(String(40), default="basketball")
    dominant_side: Mapped[str] = mapped_column(String(12), default="unknown")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Measurement(Record, Base):
    __tablename__ = "studio_measurements"
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    values: Mapped[dict] = mapped_column(JSONB, default=dict)


class Team(Record, Base):
    __tablename__ = "studio_teams"
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    sport: Mapped[str] = mapped_column(String(40), default="basketball")
    description: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Membership(Record, Base):
    __tablename__ = "studio_memberships"
    __table_args__ = (UniqueConstraint("team_id", "athlete_id", name="uq_studio_team_athlete"),)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_teams.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id", ondelete="CASCADE"), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Invitation(Record, Base):
    __tablename__ = "studio_invitations"
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_teams.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Assignment(Record, Base):
    __tablename__ = "studio_assignments"
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    team_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_teams.id"))
    athlete_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_athletes.id"))
    title: Mapped[str] = mapped_column(String(160))
    skill_id: Mapped[str] = mapped_column(String(80))
    instructions: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    published: Mapped[bool] = mapped_column(Boolean, default=False)


class Practice(Record, Base):
    __tablename__ = "studio_practices"
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_teams.id"))
    title: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str] = mapped_column(Text, default="")
    scheduled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    roster: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(24), default="draft")


class PracticeEvent(Record, Base):
    __tablename__ = "studio_practice_events"
    practice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_practices.id", ondelete="CASCADE"), index=True)
    athlete_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_athletes.id"))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class TrainingSession(Record, Base):
    __tablename__ = "studio_sessions"
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_athletes.id"), index=True)
    skill_id: Mapped[str] = mapped_column(String(80))
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_assignments.id"))
    measurement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_measurements.id"))
    status: Mapped[str] = mapped_column(String(24), default="awaiting_upload")
    source: Mapped[dict] = mapped_column(JSONB, default=dict)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    analysis: Mapped[dict] = mapped_column(JSONB, default=dict, deferred=True)
    error: Mapped[str | None] = mapped_column(Text)


class ShotReview(Record, Base):
    """Append-only coach/owner review of a pose-derived shot candidate."""
    __tablename__ = "studio_shot_reviews"
    # Unlike transaction-scoped now(), this reflects insertion time after the
    # session row lock has been acquired, preserving append chronology.
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("clock_timestamp()"))
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_sessions.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[str] = mapped_column(String(80), index=True)
    source_analysis_sha256: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(16))
    interval_ms: Mapped[dict | None] = mapped_column(JSONB)
    release: Mapped[dict | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(Text)


class SessionShare(Record, Base):
    __tablename__ = "studio_session_shares"
    __table_args__ = (UniqueConstraint("session_id", "team_id", name="uq_studio_session_team"),)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_sessions.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_teams.id", ondelete="CASCADE"))


class Feedback(Record, Base):
    __tablename__ = "studio_feedback"
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("studio_sessions.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=False)


class Device(Record, Base):
    __tablename__ = "studio_devices"
    __table_args__ = (UniqueConstraint("owner_id", "serial", name="uq_studio_device_owner_serial"),)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    serial: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(24))
    athlete_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("studio_athletes.id"))


class AuditEvent(Record, Base):
    __tablename__ = "studio_audit"
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[str] = mapped_column(String(80))
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
