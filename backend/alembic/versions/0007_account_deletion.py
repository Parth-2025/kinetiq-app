"""Record authenticated account deletion requests for operator processing.

Revision ID: 0007_account_deletion
Revises: 0006_sensor_protocol
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007_account_deletion"
down_revision = "0006_sensor_protocol"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "studio_account_deletion_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("operator_note", sa.Text()),
    )
    op.create_index("ix_studio_account_deletion_requests_user_id", "studio_account_deletion_requests", ["user_id"])
    op.create_index("ix_studio_account_deletion_requests_status", "studio_account_deletion_requests", ["status"])


def downgrade():
    op.drop_table("studio_account_deletion_requests")
