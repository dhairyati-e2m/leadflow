import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, JSONVariant, TimestampMixin


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Organization(Base, TimestampMixin):
    __tablename__ = "orgs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)

    # Relationships
    memberships: Mapped[List["Membership"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    leads: Mapped[List["Lead"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    searches: Mapped[List["Search"]] = relationship(back_populates="organization", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        if "name" in kwargs and not kwargs.get("normalized_name"):
            import re
            kwargs["normalized_name"] = re.sub(r"\s+", " ", kwargs["name"].strip().lower())
        super().__init__(**kwargs)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # J5 Password Reset & Recovery
    reset_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    reset_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    security_question: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    security_answer_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    memberships: Mapped[List["Membership"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Membership(Base, TimestampMixin):
    __tablename__ = "memberships"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="analyst", nullable=False)  # owner, admin, analyst, reviewer

    organization: Mapped["Organization"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_membership_org_user"),
    )


class Audience(Base, TimestampMixin):
    """Configurable Ideal Customer Profile (ICP) definition"""
    __tablename__ = "audiences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    filters: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)  # Industries, locations, size
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ScoringEngine(Base, TimestampMixin):
    """Scoring engine versioning and configuration templates"""
    __tablename__ = "engines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), default="1.0.0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    params: Mapped[List["EngineParam"]] = relationship(back_populates="engine", cascade="all, delete-orphan")


class EngineParam(Base, TimestampMixin):
    """Configurable weights and thresholds for an engine"""
    __tablename__ = "engine_params"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    engine_id: Mapped[str] = mapped_column(String(36), ForeignKey("engines.id", ondelete="CASCADE"), index=True, nullable=False)
    param_key: Mapped[str] = mapped_column(String(100), nullable=False)
    param_value: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, nullable=False)

    engine: Mapped["ScoringEngine"] = relationship(back_populates="params")


class Search(Base, TimestampMixin):
    """Lead sourcing session (via CSV or future discovery query)"""
    __tablename__ = "searches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), default="csv", nullable=False)  # csv, api, mock
    status: Mapped[str] = mapped_column(String(50), default="completed", nullable=False)
    total_leads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)

    organization: Mapped["Organization"] = relationship(back_populates="searches")
    leads: Mapped[List["Lead"]] = relationship(back_populates="search", cascade="all, delete-orphan")


class Lead(Base, TimestampMixin):
    """Core B2B prospect company entity"""
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    search_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("searches.id", ondelete="SET NULL"), index=True)

    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    industry: Mapped[Optional[str]] = mapped_column(String(100))
    location: Mapped[Optional[str]] = mapped_column(String(100))
    employee_count: Mapped[Optional[str]] = mapped_column(String(50))

    # Pipeline state: new, enriching, review, qualified, rejected, approved, drafted, synced, failed, archived
    pipeline_state: Mapped[str] = mapped_column(String(50), default="new", index=True, nullable=False)
    score_band: Mapped[Optional[str]] = mapped_column(String(50))  # disqualified, review, qualified
    latest_score: Mapped[Optional[float]] = mapped_column(Float)

    raw_data: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)

    organization: Mapped["Organization"] = relationship(back_populates="leads")
    search: Mapped[Optional["Search"]] = relationship(back_populates="leads")
    enrichments: Mapped[List["Enrichment"]] = relationship(back_populates="lead", cascade="all, delete-orphan")
    scores: Mapped[List["Score"]] = relationship(back_populates="lead", cascade="all, delete-orphan")
    contacts: Mapped[List["Contact"]] = relationship(back_populates="lead", cascade="all, delete-orphan")
    drafts: Mapped[List["Draft"]] = relationship(back_populates="lead", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("org_id", "domain", name="uq_lead_org_domain"),
    )


class Enrichment(Base, TimestampMixin):
    """Raw crawled website evidence and external enrichment artifacts"""
    __tablename__ = "enrichments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)

    provider: Mapped[str] = mapped_column(String(100), default="safe_crawler", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="success", nullable=False)  # success, failed, partial
    crawled_url: Mapped[str] = mapped_column(String(500), nullable=False)
    evidence: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)  # Normalized evidence payload
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    lead: Mapped["Lead"] = relationship(back_populates="enrichments")


class Score(Base, TimestampMixin):
    """Versioned score evaluation snapshot with 22 signals"""
    __tablename__ = "scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)

    engine_version: Mapped[str] = mapped_column(String(50), nullable=False)
    final_score: Mapped[float] = mapped_column(Float, nullable=False)
    qualification_band: Mapped[str] = mapped_column(String(50), nullable=False)

    website_group_score: Mapped[float] = mapped_column(Float, nullable=False)
    marketing_group_score: Mapped[float] = mapped_column(Float, nullable=False)
    ideal_client_bonus_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    signal_breakdown: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, nullable=False)  # All 22 signal results
    config_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, nullable=False)

    lead: Mapped["Lead"] = relationship(back_populates="scores")


class Contact(Base, TimestampMixin):
    """Key decision maker contacts attached to a lead"""
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(500))

    # Contact reveal protection gate
    is_revealed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revealed_by_user_id: Mapped[Optional[str]] = mapped_column(String(36))

    lead: Mapped["Lead"] = relationship(back_populates="contacts")


class Draft(Base, TimestampMixin):
    """Outreach email drafts awaiting human review"""
    __tablename__ = "drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)
    contact_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("contacts.id", ondelete="SET NULL"))

    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    draft_type: Mapped[str] = mapped_column(String(50), default="template", nullable=False)  # template, ai
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by_user_id: Mapped[Optional[str]] = mapped_column(String(36))

    lead: Mapped["Lead"] = relationship(back_populates="drafts")


class CRMConnection(Base, TimestampMixin):
    """Tenant CRM integration configuration (HubSpot)"""
    __tablename__ = "crm_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)

    provider: Mapped[str] = mapped_column(String(50), default="hubspot", nullable=False)
    mode: Mapped[str] = mapped_column(String(50), default="disabled", nullable=False)  # mock, live, disabled
    encrypted_credentials: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="disconnected", nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class CRMSync(Base, TimestampMixin):
    """Individual lead CRM sync log"""
    __tablename__ = "crm_syncs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)

    provider: Mapped[str] = mapped_column(String(50), default="hubspot", nullable=False)
    remote_company_id: Mapped[Optional[str]] = mapped_column(String(255))
    remote_contact_id: Mapped[Optional[str]] = mapped_column(String(255))
    sync_status: Mapped[str] = mapped_column(String(50), default="synced", nullable=False)
    response_payload: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)


class Run(Base, TimestampMixin):
    """Background execution run tracker"""
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    search_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("searches.id", ondelete="SET NULL"))

    run_type: Mapped[str] = mapped_column(String(50), default="enrich_and_score", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True, nullable=False)  # pending, running, completed, failed, cancelled
    total_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    checkpoint_data: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    error_message: Mapped[Optional[str]] = mapped_column(Text)


class AuditLog(Base):
    """Immutable audit trail for all sensitive tenant actions"""
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)

    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    details: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class UsageLedger(Base):
    """Tenant usage and quota accounting"""
    __tablename__ = "usage_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)

    metric: Mapped[str] = mapped_column(String(100), nullable=False)  # leads_imported, pages_crawled, contacts_revealed
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    month_period: Mapped[str] = mapped_column(String(7), nullable=False)  # e.g. "2026-10"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class AccessRequest(Base, TimestampMixin):
    """User request to join an existing organization or client portal"""
    __tablename__ = "access_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Submitted client reference or identifier
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True, nullable=False)  # pending, approved, rejected
    reviewed_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship()
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    reviewer: Mapped[Optional["User"]] = relationship(foreign_keys=[reviewed_by_user_id])


class WorkspaceRequest(Base, TimestampMixin):
    """User request to create a new workspace organization, subject to Super Admin approval"""
    __tablename__ = "workspace_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    proposed_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True, nullable=False)  # pending, approved, rejected
    created_org_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True)
    reviewed_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    reviewer: Mapped[Optional["User"]] = relationship(foreign_keys=[reviewed_by_user_id])
    created_org: Mapped[Optional["Organization"]] = relationship()


class Notification(Base, TimestampMixin):
    """In-app persistent notification for users and administrators"""
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    recipient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    org_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("orgs.id", ondelete="SET NULL"), index=True, nullable=True)
    type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)  # access_request, access_decision, workspace_request, workspace_decision, system
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONVariant, default=dict)

    recipient: Mapped["User"] = relationship(foreign_keys=[recipient_id])
    organization: Mapped[Optional["Organization"]] = relationship(foreign_keys=[org_id])

