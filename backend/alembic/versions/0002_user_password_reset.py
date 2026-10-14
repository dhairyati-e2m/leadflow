"""0002 Add User Password Reset and Security Question Fields

Revision ID: 0002_user_password_reset
Revises: 0001_initial_schema
Create Date: 2026-10-14 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_user_password_reset"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("reset_token_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("security_question", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("security_answer_hash", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_users_reset_token_hash"), "users", ["reset_token_hash"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_reset_token_hash"), table_name="users")
    op.drop_column("users", "security_answer_hash")
    op.drop_column("users", "security_question")
    op.drop_column("users", "reset_token_expires_at")
    op.drop_column("users", "reset_token_hash")
