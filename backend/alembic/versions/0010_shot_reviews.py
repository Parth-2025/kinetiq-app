"""Append-only reviewed shot intervals.

Revision ID: 0010_shot_reviews
Revises: 0009_display_rig_revisions
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0010_shot_reviews"
down_revision = "0009_display_rig_revisions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("studio_shot_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("candidate_id", sa.String(80), nullable=False),
        sa.Column("source_analysis_sha256", sa.String(64), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("interval_ms", JSONB, nullable=True),
        sa.Column("release", JSONB, nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")))
    op.create_index("ix_studio_shot_reviews_session_id", "studio_shot_reviews", ["session_id"])
    op.create_index("ix_studio_shot_reviews_reviewer_id", "studio_shot_reviews", ["reviewer_id"])
    op.create_index("ix_studio_shot_reviews_candidate_id", "studio_shot_reviews", ["candidate_id"])


def downgrade():
    op.drop_table("studio_shot_reviews")
