"""Persist immutable display rig revisions.

Revision ID: 0009_display_rig_revisions
Revises: 0008_practice_tracking
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0009_display_rig_revisions"
down_revision = "0008_practice_tracking"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("studio_display_rig_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_sha256", sa.String(64), nullable=False),
        sa.Column("artifact_sha256", sa.String(64), nullable=False),
        sa.Column("algorithm_version", sa.String(80), nullable=False),
        sa.Column("rig", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("session_id", "input_sha256", name="uq_studio_rig_session_input"))
    op.create_index("ix_studio_display_rig_revisions_session_id", "studio_display_rig_revisions", ["session_id"])


def downgrade():
    op.drop_table("studio_display_rig_revisions")
