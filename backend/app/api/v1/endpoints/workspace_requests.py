from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import get_current_user
from backend.app.models.entities import (
    Audience,
    AuditLog,
    EngineParam,
    Membership,
    Organization,
    ScoringEngine,
    User,
    WorkspaceRequest,
)
from backend.app.services.notifications import create_and_send_notification

router = APIRouter()


def normalize_org_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.strip().lower())
    cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", cleaned)
    return cleaned


def generate_slug(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", "", name).strip().lower()
    return re.sub(r"[\s-]+", "-", cleaned) or "workspace"


class SubmitWorkspaceRequest(BaseModel):
    proposed_name: str = Field(..., min_length=2, max_length=255)
    intended_use: Optional[str] = Field(None, max_length=1000)


class ReviewWorkspaceDecision(BaseModel):
    rejection_reason: Optional[str] = Field(None, max_length=1000)


class WorkspaceRequestOut(BaseModel):
    id: str
    user_id: str
    user_email: str
    user_full_name: str
    proposed_name: str
    normalized_name: str
    status: str
    created_org_id: Optional[str] = None
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    duplicate_warning: bool = False
    created_at: str


@router.post("", response_model=WorkspaceRequestOut, status_code=status.HTTP_201_CREATED, summary="Submit Workspace Creation Request (Requires Super Admin Approval)")
async def submit_workspace_request(
    data: SubmitWorkspaceRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceRequestOut:
    norm_name = normalize_org_name(data.proposed_name)

    # 1. Check if active organisation already exists
    existing_org = (
        await session.execute(select(Organization).where(Organization.normalized_name == norm_name))
    ).scalars().first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access.",
        )

    # 2. Check for duplicate pending request by user
    existing_pending = (
        await session.execute(
            select(WorkspaceRequest).where(
                WorkspaceRequest.normalized_name == norm_name,
                WorkspaceRequest.status == "pending",
            )
        )
    ).scalars().first()
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workspace creation request with this name is already pending Super Admin approval.",
        )

    # 3. Create pending workspace request
    ws_req = WorkspaceRequest(
        user_id=user.id,
        proposed_name=data.proposed_name.strip(),
        normalized_name=norm_name,
        status="pending",
    )
    session.add(ws_req)
    await session.flush()

    # 4. Notify Super Admins
    superusers = (
        await session.execute(select(User).where(User.is_superuser == True, User.is_active == True))
    ).scalars().all()

    now_utc = datetime.now(timezone.utc)
    date_str = now_utc.strftime("%Y-%m-%d %H:%M UTC")

    for su in superusers:
        await create_and_send_notification(
            session=session,
            recipient_id=su.id,
            type="workspace_request",
            title=f"New Workspace Request: {ws_req.proposed_name}",
            message=(
                f"User {user.full_name} ({user.email}) requested creation of workspace '{ws_req.proposed_name}'.\n"
                f"Submitted: {date_str}"
            ),
            link="/super-admin",
            metadata_json={
                "request_id": ws_req.id,
                "requester_id": user.id,
                "proposed_name": ws_req.proposed_name,
            },
        )

    await session.commit()
    await session.refresh(ws_req)

    return WorkspaceRequestOut(
        id=ws_req.id,
        user_id=user.id,
        user_email=user.email,
        user_full_name=user.full_name,
        proposed_name=ws_req.proposed_name,
        normalized_name=ws_req.normalized_name,
        status=ws_req.status,
        created_at=ws_req.created_at.isoformat() if ws_req.created_at else "",
    )


@router.get("/my", response_model=List[WorkspaceRequestOut], summary="List Current User's Workspace Requests")
async def list_my_workspace_requests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[WorkspaceRequestOut]:
    stmt = (
        select(WorkspaceRequest)
        .where(WorkspaceRequest.user_id == user.id)
        .order_by(WorkspaceRequest.created_at.desc())
    )
    results = (await session.execute(stmt)).scalars().all()
    return [
        WorkspaceRequestOut(
            id=req.id,
            user_id=user.id,
            user_email=user.email,
            user_full_name=user.full_name,
            proposed_name=req.proposed_name,
            normalized_name=req.normalized_name,
            status=req.status,
            created_org_id=req.created_org_id,
            reviewed_by_user_id=req.reviewed_by_user_id,
            reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
            rejection_reason=req.rejection_reason,
            created_at=req.created_at.isoformat() if req.created_at else "",
        )
        for req in results
    ]


@router.get("/admin", response_model=List[WorkspaceRequestOut], summary="List All Workspace Requests (Super Admin)")
async def admin_list_workspace_requests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[WorkspaceRequestOut]:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required to review workspace creation requests.",
        )

    stmt = (
        select(WorkspaceRequest, User.email, User.full_name)
        .join(User, WorkspaceRequest.user_id == User.id)
        .order_by(WorkspaceRequest.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()

    # Preload existing org normalized names to flag potential duplicates
    existing_orgs = (
        await session.execute(select(Organization.normalized_name))
    ).scalars().all()
    existing_names_set = set(existing_orgs)

    return [
        WorkspaceRequestOut(
            id=req.id,
            user_id=req.user_id,
            user_email=u_email,
            user_full_name=u_name,
            proposed_name=req.proposed_name,
            normalized_name=req.normalized_name,
            status=req.status,
            created_org_id=req.created_org_id,
            reviewed_by_user_id=req.reviewed_by_user_id,
            reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
            rejection_reason=req.rejection_reason,
            duplicate_warning=(req.status == "pending" and req.normalized_name in existing_names_set),
            created_at=req.created_at.isoformat() if req.created_at else "",
        )
        for req, u_email, u_name in rows
    ]


@router.post("/admin/{request_id}/approve", response_model=WorkspaceRequestOut, summary="Approve Workspace Creation (Super Admin)")
async def admin_approve_workspace_request(
    request_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceRequestOut:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required to approve workspace creation.",
        )

    stmt = (
        select(WorkspaceRequest, User.email, User.full_name)
        .join(User, WorkspaceRequest.user_id == User.id)
        .where(WorkspaceRequest.id == request_id)
    )
    row = (await session.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace request not found.")

    req, u_email, u_name = row
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve request with current status '{req.status}'.",
        )

    # Recheck organisation uniqueness at decision time
    existing_org = (
        await session.execute(select(Organization).where(Organization.normalized_name == req.normalized_name))
    ).scalars().first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organisation with this name was already created. Cannot approve duplicate organisation.",
        )

    # Generate unique slug
    base_slug = generate_slug(req.proposed_name)
    slug = base_slug
    counter = 1
    while True:
        check = select(Organization).where(Organization.slug == slug)
        if not (await session.execute(check)).scalars().first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    # Atomic creation of Organization, Membership, default Audience and Engine
    org = Organization(
        name=req.proposed_name,
        normalized_name=req.normalized_name,
        slug=slug,
        is_active=True,
    )
    session.add(org)
    await session.flush()

    # Set tenant RLS context for subsequent child entities
    await set_rls_tenant_context(session, org.id)

    membership = Membership(org_id=org.id, user_id=req.user_id, role="owner")
    session.add(membership)

    default_audience = Audience(
        org_id=org.id,
        name="Default ICP — B2B High Growth",
        description="Standard seed Ideal Customer Profile definition.",
        filters={"min_score": 65, "industries": ["Technology", "Healthcare", "Manufacturing"]},
        is_default=True,
    )
    session.add(default_audience)

    engine = ScoringEngine(
        org_id=org.id,
        name="Standard 22-Signal Matrix",
        version="1.0.0",
        is_active=True,
    )
    session.add(engine)
    await session.flush()

    param = EngineParam(
        engine_id=engine.id,
        param_key="global_weights",
        param_value={"website_weight": 0.5, "marketing_weight": 0.5},
    )
    session.add(param)

    now_utc = datetime.now(timezone.utc)
    req.status = "approved"
    req.created_org_id = org.id
    req.reviewed_by_user_id = user.id
    req.reviewed_at = now_utc

    # Audit log
    await set_rls_tenant_context(session, org.id)
    audit = AuditLog(
        org_id=org.id,
        user_id=user.id,
        action="approve_workspace_request",
        entity_type="workspace_request",
        entity_id=req.id,
        details={
            "approved_user_id": req.user_id,
            "org_name": org.name,
            "org_id": org.id,
            "super_admin": user.email,
        },
    )
    session.add(audit)

    # Notify requester
    await create_and_send_notification(
        session=session,
        recipient_id=req.user_id,
        org_id=org.id,
        type="workspace_decision",
        title=f"Workspace '{org.name}' Approved",
        message=f"Your workspace '{org.name}' has been approved by Super Admin. You can now access your LeadFlow dashboard as an Organisation Administrator.",
        link="/",
        metadata_json={"org_id": org.id, "status": "approved"},
    )

    await session.commit()
    await session.refresh(req)

    return WorkspaceRequestOut(
        id=req.id,
        user_id=req.user_id,
        user_email=u_email,
        user_full_name=u_name,
        proposed_name=req.proposed_name,
        normalized_name=req.normalized_name,
        status=req.status,
        created_org_id=req.created_org_id,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
        created_at=req.created_at.isoformat() if req.created_at else "",
    )


@router.post("/admin/{request_id}/reject", response_model=WorkspaceRequestOut, summary="Reject Workspace Creation (Super Admin)")
async def admin_reject_workspace_request(
    request_id: str,
    decision: ReviewWorkspaceDecision,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkspaceRequestOut:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin permissions required to reject workspace creation.",
        )

    stmt = (
        select(WorkspaceRequest, User.email, User.full_name)
        .join(User, WorkspaceRequest.user_id == User.id)
        .where(WorkspaceRequest.id == request_id)
    )
    row = (await session.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace request not found.")

    req, u_email, u_name = row
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject request with current status '{req.status}'.",
        )

    now_utc = datetime.now(timezone.utc)
    reason = decision.rejection_reason.strip() if decision.rejection_reason else "Workspace creation request declined by Super Admin."
    req.status = "rejected"
    req.rejection_reason = reason
    req.reviewed_by_user_id = user.id
    req.reviewed_at = now_utc

    await create_and_send_notification(
        session=session,
        recipient_id=req.user_id,
        type="workspace_decision",
        title=f"Workspace Request Declined: {req.proposed_name}",
        message=f"Your request to create workspace '{req.proposed_name}' was not approved. Reason: {reason}",
        metadata_json={"status": "rejected", "reason": reason},
    )

    await session.commit()
    await session.refresh(req)

    return WorkspaceRequestOut(
        id=req.id,
        user_id=req.user_id,
        user_email=u_email,
        user_full_name=u_name,
        proposed_name=req.proposed_name,
        normalized_name=req.normalized_name,
        status=req.status,
        created_org_id=req.created_org_id,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
        rejection_reason=req.rejection_reason,
        created_at=req.created_at.isoformat() if req.created_at else "",
    )
