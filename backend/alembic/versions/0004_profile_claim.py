"""Persist single-use managed profile claim codes.

Revision ID: 0004_profile_claim
Revises: 0003_coach_workflows
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004_profile_claim"
down_revision = "0003_coach_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "studio_athlete_claims",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("athlete_id", UUID(as_uuid=True), sa.ForeignKey("studio_athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("coach_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_studio_athlete_claims_athlete_id", "studio_athlete_claims", ["athlete_id"])
    op.create_index("ix_studio_athlete_claims_coach_id", "studio_athlete_claims", ["coach_id"])


def downgrade():
    op.drop_table("studio_athlete_claims")
