from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session, set_rls_tenant_context
from backend.app.core.deps import get_current_user
from backend.app.models.entities import AccessRequest, AuditLog, Membership, Organization, User
from backend.app.services.notifications import create_and_send_notification

router = APIRouter()


def normalize_org_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.strip().lower())
    cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", cleaned)
    return cleaned


class SubmitAccessRequest(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=255)
    client_id: Optional[str] = Field(None, max_length=100)
    note: Optional[str] = Field(None, max_length=1000)


class ReviewAccessDecision(BaseModel):
    role: Optional[str] = Field("client_viewer", description="Role to grant: client_viewer, analyst, or reviewer")
    rejection_reason: Optional[str] = Field(None, max_length=1000)


class AccessRequestOut(BaseModel):
    id: str
    org_id: str
    org_name: str
    user_id: str
    user_email: str
    user_full_name: str
    client_id: Optional[str] = None
    note: Optional[str] = None
    status: str
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: str


@router.post("", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED, summary="Submit Access Request to Existing Organisation")
async def submit_access_request(
    data: SubmitAccessRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AccessRequestOut:
    norm_name = normalize_org_name(data.org_name)
    org_stmt = select(Organization).where(
        (Organization.normalized_name == norm_name) | (Organization.slug == data.org_name.strip().lower()),
        Organization.is_active == True,
    )
    org = (await session.execute(org_stmt)).scalars().first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organisation '{data.org_name}' not found. Please verify the name or request a new workspace.",
        )

    # Check if user already a member
    mem_stmt = select(Membership).where(Membership.org_id == org.id, Membership.user_id == user.id)
    existing_mem = (await session.execute(mem_stmt)).scalars().first()
    if existing_mem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You are already a member of organisation '{org.name}' with role '{existing_mem.role}'.",
        )

    # Check for existing pending request
    pending_stmt = select(AccessRequest).where(
        AccessRequest.org_id == org.id,
        AccessRequest.user_id == user.id,
        AccessRequest.status == "pending",
    )
    existing_pending = (await session.execute(pending_stmt)).scalars().first()
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a pending access request for organisation '{org.name}'. Please await administrator review.",
        )

    # Create pending access request
    access_req = AccessRequest(
        org_id=org.id,
        user_id=user.id,
        client_id=data.client_id.strip() if data.client_id else None,
        note=data.note.strip() if data.note else None,
        status="pending",
    )
    session.add(access_req)
    await session.flush()

    # Find active Organisation Admins (role in 'owner', 'admin')
    admins_stmt = (
        select(User)
        .join(Membership, User.id == Membership.user_id)
        .where(
            Membership.org_id == org.id,
            Membership.role.in_(["owner", "admin"]),
            User.is_active == True,
        )
    )
    admins = (await session.execute(admins_stmt)).scalars().all()

    now_utc = datetime.now(timezone.utc)
    date_str = now_utc.strftime("%Y-%m-%d %H:%M UTC")

    if admins:
        # Notify Organisation Admins
        for admin in admins:
            await create_and_send_notification(
                session=session,
                recipient_id=admin.id,
                org_id=org.id,
                type="access_request",
                title=f"Access Request from {user.full_name}",
                message=(
                    f"User {user.full_name} ({user.email}) requested access to {org.name}.\n"
                    f"Client ID / Reference: {data.client_id or 'None'}\n"
                    f"Submitted: {date_str}"
                ),
                link="/",
                metadata_json={
                    "request_id": access_req.id,
                    "org_id": org.id,
                    "requester_id": user.id,
                    "client_id": data.client_id,
                },
            )
    else:
        # Escalate to Super Admins if organization has no active administrator
        superusers_stmt = select(User).where(User.is_superuser == True, User.is_active == True)
        superusers = (await session.execute(superusers_stmt)).scalars().all()
        for su in superusers:
            await create_and_send_notification(
                session=session,
                recipient_id=su.id,
                org_id=org.id,
                type="access_request_escalation",
                title=f"[Escalation] Access Request for {org.name} (No Admin)",
                message=(
                    f"User {user.full_name} ({user.email}) requested access to {org.name}, which has no active administrators.\n"
                    f"Client ID: {data.client_id or 'None'}\n"
                    f"Submitted: {date_str}"
                ),
                link="/super-admin",
                metadata_json={
                    "request_id": access_req.id,
                    "org_id": org.id,
                    "requester_id": user.id,
                    "escalated": True,
                },
            )

    await session.commit()
    await session.refresh(access_req)

    return AccessRequestOut(
        id=access_req.id,
        org_id=org.id,
        org_name=org.name,
        user_id=user.id,
        user_email=user.email,
        user_full_name=user.full_name,
        client_id=access_req.client_id,
        note=access_req.note,
        status=access_req.status,
        created_at=access_req.created_at.isoformat() if access_req.created_at else "",
    )


@router.get("/my", response_model=List[AccessRequestOut], summary="List Current User's Access Requests")
async def list_my_access_requests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[AccessRequestOut]:
    stmt = (
        select(AccessRequest, Organization.name)
        .join(Organization, AccessRequest.org_id == Organization.id)
        .where(AccessRequest.user_id == user.id)
        .order_by(AccessRequest.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        AccessRequestOut(
            id=req.id,
            org_id=req.org_id,
            org_name=org_name,
            user_id=user.id,
            user_email=user.email,
            user_full_name=user.full_name,
            client_id=req.client_id,
            note=req.note,
            status=req.status,
            reviewed_by_user_id=req.reviewed_by_user_id,
            reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
            rejection_reason=req.rejection_reason,
            created_at=req.created_at.isoformat() if req.created_at else "",
        )
        for req, org_name in rows
    ]


@router.get("/{org_id}", response_model=List[AccessRequestOut], summary="List Organisation Access Requests (Org Admin)")
async def list_org_access_requests(
    org_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> List[AccessRequestOut]:
    # Authorization: User must be owner/admin of org_id or superuser
    if not user.is_superuser:
        mem_stmt = select(Membership).where(
            Membership.org_id == org_id,
            Membership.user_id == user.id,
            Membership.role.in_(["owner", "admin"]),
        )
        if not (await session.execute(mem_stmt)).scalars().first():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organisation Administrators may view access requests for this organisation.",
            )

    stmt = (
        select(AccessRequest, Organization.name, User.email, User.full_name)
        .join(Organization, AccessRequest.org_id == Organization.id)
        .join(User, AccessRequest.user_id == User.id)
        .where(AccessRequest.org_id == org_id)
        .order_by(AccessRequest.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()

    return [
        AccessRequestOut(
            id=req.id,
            org_id=req.org_id,
            org_name=org_name,
            user_id=req.user_id,
            user_email=u_email,
            user_full_name=u_name,
            client_id=req.client_id,
            note=req.note,
            status=req.status,
            reviewed_by_user_id=req.reviewed_by_user_id,
            reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
            rejection_reason=req.rejection_reason,
            created_at=req.created_at.isoformat() if req.created_at else "",
        )
        for req, org_name, u_email, u_name in rows
    ]


@router.post("/{org_id}/{request_id}/approve", response_model=AccessRequestOut, summary="Approve Organisation Access Request")
async def approve_access_request(
    org_id: str,
    request_id: str,
    decision: ReviewAccessDecision,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AccessRequestOut:
    # 1. Authorization check
    if not user.is_superuser:
        mem_stmt = select(Membership).where(
            Membership.org_id == org_id,
            Membership.user_id == user.id,
            Membership.role.in_(["owner", "admin"]),
        )
        if not (await session.execute(mem_stmt)).scalars().first():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organisation Administrators may approve access requests.",
            )

    # 2. Load access request
    req_stmt = (
        select(AccessRequest, Organization.name, User.email, User.full_name)
        .join(Organization, AccessRequest.org_id == Organization.id)
        .join(User, AccessRequest.user_id == User.id)
        .where(AccessRequest.id == request_id, AccessRequest.org_id == org_id)
    )
    row = (await session.execute(req_stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found.")

    req, org_name, u_email, u_name = row
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve request with current status '{req.status}'.",
        )

    # 3. Prevent self-approval
    if req.user_id == user.id and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users cannot approve their own access requests.",
        )

    # 4. Atomic Execution: Grant membership & update request
    assigned_role = decision.role if decision.role in ["client_viewer", "analyst", "reviewer"] else "client_viewer"
    existing_mem = (await session.execute(
        select(Membership).where(Membership.org_id == org_id, Membership.user_id == req.user_id)
    )).scalars().first()

    if not existing_mem:
        membership = Membership(org_id=org_id, user_id=req.user_id, role=assigned_role)
        session.add(membership)

    now_utc = datetime.now(timezone.utc)
    req.status = "approved"
    req.reviewed_by_user_id = user.id
    req.reviewed_at = now_utc

    # Set RLS context for audit log
    await set_rls_tenant_context(session, org_id)
    audit = AuditLog(
        org_id=org_id,
        user_id=user.id,
        action="approve_access_request",
        entity_type="access_request",
        entity_id=req.id,
        details={
            "approved_user_id": req.user_id,
            "granted_role": assigned_role,
            "client_id": req.client_id,
            "reviewer_email": user.email,
        },
    )
    session.add(audit)

    # Notify requesting user
    await create_and_send_notification(
        session=session,
        recipient_id=req.user_id,
        org_id=org_id,
        type="access_decision",
        title=f"Access Approved for {org_name}",
        message=f"Your request to join {org_name} has been approved. You now have '{assigned_role}' access.",
        link="/portal" if assigned_role == "client_viewer" else "/",
        metadata_json={"org_id": org_id, "status": "approved", "role": assigned_role},
    )

    await session.commit()
    await session.refresh(req)

    return AccessRequestOut(
        id=req.id,
        org_id=req.org_id,
        org_name=org_name,
        user_id=req.user_id,
        user_email=u_email,
        user_full_name=u_name,
        client_id=req.client_id,
        note=req.note,
        status=req.status,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
        created_at=req.created_at.isoformat() if req.created_at else "",
    )


@router.post("/{org_id}/{request_id}/reject", response_model=AccessRequestOut, summary="Reject Organisation Access Request")
async def reject_access_request(
    org_id: str,
    request_id: str,
    decision: ReviewAccessDecision,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AccessRequestOut:
    if not user.is_superuser:
        mem_stmt = select(Membership).where(
            Membership.org_id == org_id,
            Membership.user_id == user.id,
            Membership.role.in_(["owner", "admin"]),
        )
        if not (await session.execute(mem_stmt)).scalars().first():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organisation Administrators may reject access requests.",
            )

    req_stmt = (
        select(AccessRequest, Organization.name, User.email, User.full_name)
        .join(Organization, AccessRequest.org_id == Organization.id)
        .join(User, AccessRequest.user_id == User.id)
        .where(AccessRequest.id == request_id, AccessRequest.org_id == org_id)
    )
    row = (await session.execute(req_stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found.")

    req, org_name, u_email, u_name = row
    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject request with current status '{req.status}'.",
        )

    now_utc = datetime.now(timezone.utc)
    reason = decision.rejection_reason.strip() if decision.rejection_reason else "Request was declined by administrator."
    req.status = "rejected"
    req.rejection_reason = reason
    req.reviewed_by_user_id = user.id
    req.reviewed_at = now_utc

    await set_rls_tenant_context(session, org_id)
    audit = AuditLog(
        org_id=org_id,
        user_id=user.id,
        action="reject_access_request",
        entity_type="access_request",
        entity_id=req.id,
        details={
            "rejected_user_id": req.user_id,
            "rejection_reason": reason,
            "reviewer_email": user.email,
        },
    )
    session.add(audit)

    await create_and_send_notification(
        session=session,
        recipient_id=req.user_id,
        org_id=org_id,
        type="access_decision",
        title=f"Access Request Declined for {org_name}",
        message=f"Your request to join {org_name} was not approved. Reason: {reason}",
        metadata_json={"org_id": org_id, "status": "rejected", "reason": reason},
    )

    await session.commit()
    await session.refresh(req)

    return AccessRequestOut(
        id=req.id,
        org_id=req.org_id,
        org_name=org_name,
        user_id=req.user_id,
        user_email=u_email,
        user_full_name=u_name,
        client_id=req.client_id,
        note=req.note,
        status=req.status,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_at=req.reviewed_at.isoformat() if req.reviewed_at else None,
        rejection_reason=req.rejection_reason,
        created_at=req.created_at.isoformat() if req.created_at else "",
    )
