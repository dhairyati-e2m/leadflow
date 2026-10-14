"""0003 Add Organization Normalized Name for Duplicate Prevention

Revision ID: 0003_org_normalized_name
Revises: 0002_user_password_reset
Create Date: 2026-10-14 17:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003_org_normalized_name"
down_revision: Union[str, None] = "0002_user_password_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column as nullable first to allow backfilling
    op.add_column("orgs", sa.Column("normalized_name", sa.String(length=255), nullable=True))
    
    # 2. Backfill existing records with lowercased and trimmed name
    op.execute("UPDATE orgs SET normalized_name = LOWER(TRIM(name)) WHERE normalized_name IS NULL")
    
    # 3. Safely deduplicate any pre-existing historical test duplicates before creating unique index
    op.execute("""
        WITH ranked AS (
            SELECT id, normalized_name,
                   ROW_NUMBER() OVER (PARTITION BY normalized_name ORDER BY created_at ASC) as rn
            FROM orgs
        )
        UPDATE orgs
        SET normalized_name = orgs.normalized_name || '-' || (ranked.rn - 1)
        FROM ranked
        WHERE orgs.id = ranked.id AND ranked.rn > 1;
    """)
    
    # 4. Enforce NOT NULL
    op.alter_column("orgs", "normalized_name", nullable=False)
    
    # 5. Create unique index for concurrency safety
    op.create_index(op.f("ix_orgs_normalized_name"), "orgs", ["normalized_name"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_orgs_normalized_name"), table_name="orgs")
    op.drop_column("orgs", "normalized_name")
