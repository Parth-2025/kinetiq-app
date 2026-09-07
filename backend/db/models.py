from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

_UUID_DEFAULT = text("gen_random_uuid()")
_NOW = text("now()")
# clock_timestamp() advances within a transaction, so rows inserted back-to-back
# (e.g. in one request/test) get strictly increasing timestamps — needed for
# deterministic "newest first" ordering of analysis_sessions.
_CLOCK = text("clock_timestamp()")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
    )
    auth0_sub: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    picture: Mapped[str | None] = mapped_column(Text)
    username: Mapped[str | None] = mapped_column(String(20), unique=True)
    active_sport: Mapped[str | None] = mapped_column(Text)
    active_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_sessions.id", ondelete="SET NULL", use_alter=True,
                   name="fk_users_active_session"),
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW, server_onupdate=_NOW
    )

    sports: Mapped[list[UserSport]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserSport(Base):
    __tablename__ = "user_sports"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    sport: Mapped[str] = mapped_column(Text, primary_key=True)
    added_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW
    )

    user: Mapped[User] = relationship(back_populates="sports")


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sport: Mapped[str] = mapped_column(Text, nullable=False)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    source: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    analysis: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=_CLOCK, index=True
    )
