"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("auth0_sub", sa.Text(), nullable=False),
        sa.Column("email", sa.Text()),
        sa.Column("name", sa.Text()),
        sa.Column("picture", sa.Text()),
        sa.Column("username", sa.String(length=20)),
        sa.Column("active_sport", sa.Text()),
        sa.Column("active_session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("auth0_sub", name="uq_users_auth0_sub"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    op.create_table(
        "analysis_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sport", sa.Text(), nullable=False),
        sa.Column("overall_score", sa.Numeric(precision=6, scale=2)),
        sa.Column("source", postgresql.JSONB(), nullable=False),
        sa.Column("analysis", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_analysis_sessions_user_id", "analysis_sessions", ["user_id"])
    op.create_index(
        "ix_sessions_user_created", "analysis_sessions",
        ["user_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "user_sports",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sport", sa.Text(), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_foreign_key(
        "fk_users_active_session", "users", "analysis_sessions",
        ["active_session_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_active_session", "users", type_="foreignkey")
    op.drop_table("user_sports")
    op.drop_index("ix_sessions_user_created", table_name="analysis_sessions")
    op.drop_index("ix_analysis_sessions_user_id", table_name="analysis_sessions")
    op.drop_table("analysis_sessions")
    op.drop_table("users")
