"""0001 Initial Schema with Multi-Tenant Tables and PostgreSQL Row-Level Security

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-12 15:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tenant tables requiring PostgreSQL Row-Level Security (RLS)
TENANT_TABLES = [
    "memberships",
    "audiences",
    "engines",
    "searches",
    "leads",
    "enrichments",
    "scores",
    "contacts",
    "drafts",
    "crm_connections",
    "crm_syncs",
    "runs",
    "audit_log",
    "usage_ledger",
]


def upgrade() -> None:
    # 1. Organizations
    op.create_table(
        "orgs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orgs_slug", "orgs", ["slug"], unique=True)

    # 2. Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 3. Memberships
    op.create_table(
        "memberships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="analyst"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "user_id", name="uq_membership_org_user"),
    )
    op.create_index("ix_memberships_org_id", "memberships", ["org_id"])
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])

    # 4. Audiences (ICP)
    op.create_table(
        "audiences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audiences_org_id", "audiences", ["org_id"])

    # 5. Engines
    op.create_table(
        "engines",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False, server_default="1.0.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_engines_org_id", "engines", ["org_id"])

    # 6. Engine Params
    op.create_table(
        "engine_params",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("engine_id", sa.String(length=36), nullable=False),
        sa.Column("param_key", sa.String(length=100), nullable=False),
        sa.Column("param_value", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["engine_id"], ["engines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_engine_params_engine_id", "engine_params", ["engine_id"])

    # 7. Searches
    op.create_table(
        "searches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False, server_default="csv"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="completed"),
        sa.Column("total_leads", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_searches_org_id", "searches", ["org_id"])

    # 8. Leads
    op.create_table(
        "leads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("search_id", sa.String(length=36), nullable=True),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=100), nullable=True),
        sa.Column("location", sa.String(length=100), nullable=True),
        sa.Column("employee_count", sa.String(length=50), nullable=True),
        sa.Column("pipeline_state", sa.String(length=50), nullable=False, server_default="new"),
        sa.Column("score_band", sa.String(length=50), nullable=True),
        sa.Column("latest_score", sa.Float(), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["search_id"], ["searches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "domain", name="uq_lead_org_domain"),
    )
    op.create_index("ix_leads_org_id", "leads", ["org_id"])
    op.create_index("ix_leads_domain", "leads", ["domain"])
    op.create_index("ix_leads_pipeline_state", "leads", ["pipeline_state"])

    # 9. Enrichments
    op.create_table(
        "enrichments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False, server_default="safe_crawler"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="success"),
        sa.Column("crawled_url", sa.String(length=500), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_enrichments_org_id", "enrichments", ["org_id"])
    op.create_index("ix_enrichments_lead_id", "enrichments", ["lead_id"])

    # 10. Scores
    op.create_table(
        "scores",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("engine_version", sa.String(length=50), nullable=False),
        sa.Column("final_score", sa.Float(), nullable=False),
        sa.Column("qualification_band", sa.String(length=50), nullable=False),
        sa.Column("website_group_score", sa.Float(), nullable=False),
        sa.Column("marketing_group_score", sa.Float(), nullable=False),
        sa.Column("ideal_client_bonus_applied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("signal_breakdown", sa.JSON(), nullable=False),
        sa.Column("config_snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scores_org_id", "scores", ["org_id"])
    op.create_index("ix_scores_lead_id", "scores", ["lead_id"])

    # 11. Contacts
    op.create_table(
        "contacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=100), nullable=True),
        sa.Column("linkedin_url", sa.String(length=500), nullable=True),
        sa.Column("is_revealed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revealed_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contacts_org_id", "contacts", ["org_id"])
    op.create_index("ix_contacts_lead_id", "contacts", ["lead_id"])

    # 12. Drafts
    op.create_table(
        "drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("contact_id", sa.String(length=36), nullable=True),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("draft_type", sa.String(length=50), nullable=False, server_default="template"),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_drafts_org_id", "drafts", ["org_id"])
    op.create_index("ix_drafts_lead_id", "drafts", ["lead_id"])

    # 13. CRM Connections
    op.create_table(
        "crm_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="hubspot"),
        sa.Column("mode", sa.String(length=50), nullable=False, server_default="disabled"),
        sa.Column("encrypted_credentials", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="disconnected"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", name="uq_crm_connection_org"),
    )
    op.create_index("ix_crm_connections_org_id", "crm_connections", ["org_id"])

    # 14. CRM Syncs
    op.create_table(
        "crm_syncs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="hubspot"),
        sa.Column("remote_company_id", sa.String(length=255), nullable=True),
        sa.Column("remote_contact_id", sa.String(length=255), nullable=True),
        sa.Column("sync_status", sa.String(length=50), nullable=False, server_default="synced"),
        sa.Column("response_payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crm_syncs_org_id", "crm_syncs", ["org_id"])
    op.create_index("ix_crm_syncs_lead_id", "crm_syncs", ["lead_id"])

    # 15. Runs
    op.create_table(
        "runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("search_id", sa.String(length=36), nullable=True),
        sa.Column("run_type", sa.String(length=50), nullable=False, server_default="enrich_and_score"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("checkpoint_data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["search_id"], ["searches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_runs_org_id", "runs", ["org_id"])
    op.create_index("ix_runs_status", "runs", ["status"])

    # 16. Audit Log
    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_org_id", "audit_log", ["org_id"])
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])

    # 17. Usage Ledger
    op.create_table(
        "usage_ledger",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("metric", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("month_period", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_usage_ledger_org_id", "usage_ledger", ["org_id"])
    op.create_index("ix_usage_ledger_month", "usage_ledger", ["month_period"])

    # 18. Enable PostgreSQL Row-Level Security (RLS) policies on tenant tables
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in TENANT_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
            op.execute(
                f"CREATE POLICY {table}_tenant_isolation ON {table} "
                f"FOR ALL "
                f"USING (org_id = current_setting('app.current_org_id', true));"
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in reversed(TENANT_TABLES):
            op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table};")
            op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    for table in [
        "usage_ledger", "audit_log", "runs", "crm_syncs", "crm_connections",
        "drafts", "contacts", "scores", "enrichments", "leads", "searches",
        "engine_params", "engines", "audiences", "memberships", "users", "orgs"
    ]:
        op.drop_table(table)
