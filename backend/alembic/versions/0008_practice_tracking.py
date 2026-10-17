"""Add private single-camera tracking jobs.

Revision ID: 0008_practice_tracking
Revises: 0007_account_deletion
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0008_practice_tracking"
down_revision = "0007_account_deletion"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("studio_practice_tracking_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("practice_id", UUID(as_uuid=True), sa.ForeignKey("studio_practices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("studio_practice_camera_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("result", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("links", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("error", sa.String(240)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    for col in ("practice_id", "source_id", "owner_id", "status"):
        op.create_index(f"ix_studio_practice_tracking_jobs_{col}", "studio_practice_tracking_jobs", [col])


def downgrade():
    op.drop_table("studio_practice_tracking_jobs")
