"""In-app account deletion requests awaiting operator processing."""
import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.models import Base


class AccountDeletionRequest(Base):
    __tablename__ = "studio_account_deletion_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", server_default="pending", index=True)
    requested_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    processed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    operator_note: Mapped[str | None] = mapped_column(Text())
