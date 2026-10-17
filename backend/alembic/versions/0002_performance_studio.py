"""Persistent Performance Studio domain.

Revision ID: 0002_studio
Revises: 0001_initial
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision = "0002_studio"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def uid(name, target=None, nullable=False, primary=False, unique=False, cascade=False):
    args = [sa.ForeignKey(target, ondelete="CASCADE" if cascade else None)] if target else []
    return sa.Column(name, UUID(as_uuid=True), *args, nullable=nullable, primary_key=primary, unique=unique)


def string(name, size=120, nullable=False):
    return sa.Column(name, sa.String(size), nullable=nullable)


def table(name, *columns):
    op.create_table(name,
        uid("id", primary=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        *columns)


def upgrade():
    op.create_table("studio_accounts", uid("user_id", "users.id", primary=True, cascade=True),
        string("role", 16), sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("onboarding_complete", sa.Boolean(), nullable=False))
    table("studio_athletes", uid("creator_id", "users.id"), uid("account_id", "users.id", nullable=True, unique=True),
        string("name"), string("sport", 40), string("dominant_side", 12), sa.Column("archived", sa.Boolean(), nullable=False))
    table("studio_measurements", uid("athlete_id", "studio_athletes.id", cascade=True), uid("actor_id", "users.id"), sa.Column("values", JSONB(), nullable=False))
    table("studio_teams", uid("owner_id", "users.id"), string("name"), string("sport", 40),
        sa.Column("description", sa.Text(), nullable=False), sa.Column("archived", sa.Boolean(), nullable=False))
    table("studio_memberships", uid("team_id", "studio_teams.id", cascade=True), uid("athlete_id", "studio_athletes.id", cascade=True),
        sa.Column("active", sa.Boolean(), nullable=False), sa.UniqueConstraint("team_id", "athlete_id", name="uq_studio_team_athlete"))
    table("studio_invitations", uid("team_id", "studio_teams.id", cascade=True), string("token_hash", 64),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("token_hash"))
    table("studio_assignments", uid("owner_id", "users.id"), uid("team_id", "studio_teams.id", nullable=True),
        uid("athlete_id", "studio_athletes.id", nullable=True), string("title", 160), string("skill_id", 80),
        sa.Column("instructions", sa.Text(), nullable=False), sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("published", sa.Boolean(), nullable=False))
    table("studio_practices", uid("owner_id", "users.id"), uid("team_id", "studio_teams.id"), string("title", 160),
        sa.Column("notes", sa.Text(), nullable=False), sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("roster", JSONB(), nullable=False), string("status", 24))
    table("studio_practice_events", uid("practice_id", "studio_practices.id", cascade=True), uid("athlete_id", "studio_athletes.id", nullable=True),
        uid("actor_id", "users.id"), sa.Column("data", JSONB(), nullable=False))
    table("studio_sessions", uid("owner_id", "users.id"), uid("athlete_id", "studio_athletes.id"), string("skill_id", 80),
        uid("assignment_id", "studio_assignments.id", nullable=True), uid("measurement_id", "studio_measurements.id", nullable=True),
        string("status", 24), sa.Column("source", JSONB(), nullable=False), sa.Column("metrics", JSONB(), nullable=False), sa.Column("analysis", JSONB(), nullable=False), sa.Column("error", sa.Text()))
    table("studio_session_shares", uid("session_id", "studio_sessions.id", cascade=True), uid("team_id", "studio_teams.id", cascade=True),
        sa.UniqueConstraint("session_id", "team_id", name="uq_studio_session_team"))
    table("studio_feedback", uid("coach_id", "users.id"), uid("session_id", "studio_sessions.id", cascade=True),
        sa.Column("body", sa.Text(), nullable=False), sa.Column("published", sa.Boolean(), nullable=False))
    table("studio_devices", uid("owner_id", "users.id"), string("name"), string("serial"), string("kind", 24),
        uid("athlete_id", "studio_athletes.id", nullable=True), sa.UniqueConstraint("owner_id", "serial", name="uq_studio_device_owner_serial"))
    table("studio_audit", uid("actor_id", "users.id"), string("action", 80), string("resource_id", 80), sa.Column("detail", JSONB(), nullable=False))
    for name, fields in {
        "athletes": ["creator_id"], "measurements": ["athlete_id"], "teams": ["owner_id"],
        "memberships": ["team_id", "athlete_id"], "assignments": ["owner_id"], "practices": ["owner_id"],
        "practice_events": ["practice_id"], "sessions": ["owner_id", "athlete_id"],
        "session_shares": ["session_id"], "feedback": ["coach_id", "session_id"], "devices": ["owner_id"], "audit": ["actor_id"],
    }.items():
        for field in fields:
            op.create_index(f"ix_studio_{name}_{field}", f"studio_{name}", [field])


def downgrade():
    for name in ["audit", "devices", "feedback", "session_shares", "sessions", "practice_events", "practices",
                 "assignments", "invitations", "memberships", "teams", "measurements", "athletes", "accounts"]:
        op.drop_table(f"studio_{name}")
