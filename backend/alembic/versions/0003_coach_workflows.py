"""Persist assignment completion state.

Revision ID: 0003_coach_workflows
Revises: 0002_studio
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0003_coach_workflows"
down_revision = "0002_studio"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "studio_assignment_completions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("assignment_id", UUID(as_uuid=True), sa.ForeignKey("studio_assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", UUID(as_uuid=True), sa.ForeignKey("studio_athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("assignment_id", "athlete_id", name="uq_studio_assignment_completion"),
    )
    op.create_index("ix_studio_assignment_completions_assignment_id", "studio_assignment_completions", ["assignment_id"])
    op.create_index("ix_studio_assignment_completions_athlete_id", "studio_assignment_completions", ["athlete_id"])


def downgrade():
    op.drop_table("studio_assignment_completions")
