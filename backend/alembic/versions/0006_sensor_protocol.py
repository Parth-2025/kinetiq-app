"""Add bounded sensor protocol metadata and imported capture records.

Revision ID: 0006_sensor_protocol
Revises: 0005_practice_capture
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0006_sensor_protocol"
down_revision = "0005_practice_capture"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "studio_sensor_device_protocols",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("studio_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("coach_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", UUID(as_uuid=True), sa.ForeignKey("studio_athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("capabilities", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("firmware_version", sa.String(80)),
        sa.Column("timebase", sa.String(40), nullable=False, server_default="host_monotonic"),
        sa.Column("metadata_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("device_id", name="uq_sensor_protocol_device"),
    )
    op.create_index("ix_studio_sensor_device_protocols_device_id", "studio_sensor_device_protocols", ["device_id"])
    op.create_index("ix_studio_sensor_device_protocols_coach_id", "studio_sensor_device_protocols", ["coach_id"])
    op.create_index("ix_studio_sensor_device_protocols_athlete_id", "studio_sensor_device_protocols", ["athlete_id"])
    op.create_table(
        "studio_sensor_capture_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("coach_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", UUID(as_uuid=True), sa.ForeignKey("studio_athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("practice_id", UUID(as_uuid=True), sa.ForeignKey("studio_practices.id", ondelete="SET NULL")),
        sa.Column("upper_device_id", UUID(as_uuid=True), sa.ForeignKey("studio_devices.id", ondelete="SET NULL")),
        sa.Column("forearm_device_id", UUID(as_uuid=True), sa.ForeignKey("studio_devices.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(24), nullable=False, server_default="created"),
        sa.Column("source_format", sa.String(12)),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("samples", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("provenance", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("imported_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_studio_sensor_capture_sessions_coach_id", "studio_sensor_capture_sessions", ["coach_id"])
    op.create_index("ix_studio_sensor_capture_sessions_athlete_id", "studio_sensor_capture_sessions", ["athlete_id"])
    op.create_index("ix_studio_sensor_capture_sessions_practice_id", "studio_sensor_capture_sessions", ["practice_id"])
    op.create_table(
        "studio_sensor_calibrations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("coach_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", UUID(as_uuid=True), sa.ForeignKey("studio_athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("upper_device_id", UUID(as_uuid=True), sa.ForeignKey("studio_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("forearm_device_id", UUID(as_uuid=True), sa.ForeignKey("studio_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("segment_orientation", JSONB, nullable=False),
        sa.Column("timestamp_provenance", JSONB, nullable=False),
        sa.Column("calibration_samples", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index("ix_studio_sensor_calibrations_coach_id", "studio_sensor_calibrations", ["coach_id"])
    op.create_index("ix_studio_sensor_calibrations_athlete_id", "studio_sensor_calibrations", ["athlete_id"])
    op.add_column("studio_sensor_capture_sessions", sa.Column("calibration_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_sensor_capture_calibration", "studio_sensor_capture_sessions",
        "studio_sensor_calibrations", ["calibration_id"], ["id"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("fk_sensor_capture_calibration", "studio_sensor_capture_sessions", type_="foreignkey")
    op.drop_column("studio_sensor_capture_sessions", "calibration_id")
    op.drop_table("studio_sensor_calibrations")
    op.drop_table("studio_sensor_capture_sessions")
    op.drop_table("studio_sensor_device_protocols")
