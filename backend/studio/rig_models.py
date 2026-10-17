"""Private immutable stored display rig revisions."""
import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models import Base
from studio.models import Record


class DisplayRigRevision(Record, Base):
    __tablename__ = "studio_display_rig_revisions"
    __table_args__ = (UniqueConstraint("session_id", "input_sha256", name="uq_studio_rig_session_input"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studio_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    input_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    artifact_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(80), nullable=False)
    rig: Mapped[dict] = mapped_column(JSONB, nullable=False)
