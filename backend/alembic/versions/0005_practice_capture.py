"""Add private practice camera source records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005_practice_capture"
down_revision = "0004_profile_claim"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "studio_practice_camera_sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("practice_id", UUID(as_uuid=True), sa.ForeignKey("studio_practices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("camera_position", sa.String(40), nullable=False, server_default="unspecified"),
        sa.Column("orientation_degrees", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("bytes", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(160), nullable=True),
        sa.Column("media_path", sa.String(500), nullable=True),
        sa.Column("calibration", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("synchronization", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("status", sa.String(32), nullable=False, server_default="awaiting_upload"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_studio_practice_camera_sources_practice_id", "studio_practice_camera_sources", ["practice_id"])
    op.create_index("ix_studio_practice_camera_sources_owner_id", "studio_practice_camera_sources", ["owner_id"])


def downgrade():
    op.drop_table("studio_practice_camera_sources")
