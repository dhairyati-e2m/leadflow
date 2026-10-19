import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.database import get_session_factory
from backend.app.core.security import hash_password
from backend.app.main import app
from backend.app.models.entities import Organization, User


async def create_test_superuser(session_factory, email: str, password: str = "SuperAdmin123!") -> User:
    async with session_factory() as session:
        user = User(
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name="Super Administrator",
            is_active=True,
            is_superuser=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.mark.asyncio
async def test_workspace_creation_approval_lifecycle():
    """Validates full workspace request flow: submission, duplicate name checks, Super Admin approval, and provisioning."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Create and authenticate Super Admin
        sa_email = f"sa_{suffix}@leadflow.io"
        await create_test_superuser(session_factory, sa_email, "SuperPass123!")
        sa_login = await client.post(
            "/v1/auth/login",
            json={"email": sa_email, "password": "SuperPass123!"},
        )
        assert sa_login.status_code == 200
        sa_token = sa_login.json()["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}

        # 2. Register standard user
        user_email = f"founder_{suffix}@startup.io"
        reg_user = await client.post(
            "/v1/auth/register",
            json={
                "email": user_email,
                "password": "Password123!",
                "full_name": "Startup Founder",
                "org_name": f"Founder Staging {suffix}",
            },
        )
        assert reg_user.status_code == 201
        user_token = reg_user.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}

        # 3. User submits workspace creation request
        proposed_name = f"Nova Analytics {suffix}"
        req_res = await client.post(
            "/v1/workspaces/requests",
            headers=user_headers,
            json={
                "proposed_name": proposed_name,
                "intended_use": "B2B SaaS product analytics pipeline.",
            },
        )
        assert req_res.status_code == 201, req_res.text
        req_data = req_res.json()
        assert req_data["proposed_name"] == proposed_name
        assert req_data["status"] == "pending"
        request_id = req_data["id"]

        # 4. Submitting duplicate pending workspace request returns 409
        dup_req = await client.post(
            "/v1/workspaces/requests",
            headers=user_headers,
            json={"proposed_name": proposed_name},
        )
        assert dup_req.status_code == 409
        assert "already pending" in dup_req.json()["detail"].lower()

        # 5. Super Admin views workspace requests list
        admin_list = await client.get("/v1/workspaces/requests/admin", headers=sa_headers)
        assert admin_list.status_code == 200
        items = admin_list.json()
        matching = next((r for r in items if r["id"] == request_id), None)
        assert matching is not None
        assert matching["duplicate_warning"] is False

        # 6. Non-superuser cannot approve workspace request (403)
        forbidden_approve = await client.post(
            f"/v1/workspaces/requests/admin/{request_id}/approve",
            headers=user_headers,
        )
        assert forbidden_approve.status_code == 403

        # 7. Super Admin approves workspace request
        approve_res = await client.post(
            f"/v1/workspaces/requests/admin/{request_id}/approve",
            headers=sa_headers,
        )
        assert approve_res.status_code == 200, approve_res.text
        app_data = approve_res.json()
        assert app_data["status"] == "approved"
        created_org_id = app_data["created_org_id"]
        assert created_org_id is not None

        # 8. Founder receives approval notification and owner membership in the new organization
        user_notifs = await client.get("/v1/notifications", headers=user_headers)
        assert user_notifs.status_code == 200
        assert any("approved" in n["title"].lower() for n in user_notifs.json()["items"])

        me_res = await client.get("/v1/auth/me", headers=user_headers)
        new_membership = next((m for m in me_res.json()["memberships"] if m["org_id"] == created_org_id), None)
        assert new_membership is not None
        assert new_membership["role"] == "owner"


@pytest.mark.asyncio
async def test_workspace_duplicate_name_warning_and_rejection():
    """Validates duplicate name detection warning and rejection flow."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]
        existing_org_name = f"Existing Corp {suffix}"

        # 1. Super Admin
        sa_email = f"sa2_{suffix}@leadflow.io"
        await create_test_superuser(session_factory, sa_email)
        sa_login = await client.post("/v1/auth/login", json={"email": sa_email, "password": "SuperAdmin123!"})
        sa_headers = {"Authorization": f"Bearer {sa_login.json()['access_token']}"}

        # 2. Existing Org
        reg_existing = await client.post(
            "/v1/auth/register",
            json={
                "email": f"owner_{suffix}@existing.com",
                "password": "Password123!",
                "full_name": "Existing Owner",
                "org_name": existing_org_name,
            },
        )
        assert reg_existing.status_code == 201

        # 3. New User attempts to request workspace with name matching existing org -> blocked with 409
        reg_user = await client.post(
            "/v1/auth/register",
            json={
                "email": f"applicant_{suffix}@test.com",
                "password": "Password123!",
                "full_name": "Applicant",
                "org_name": f"App Temp {suffix}",
            },
        )
        user_headers = {"Authorization": f"Bearer {reg_user.json()['access_token']}"}

        blocked_req = await client.post(
            "/v1/workspaces/requests",
            headers=user_headers,
            json={"proposed_name": f"  {existing_org_name.upper()}  "},
        )
        assert blocked_req.status_code == 409
        assert "already exists" in blocked_req.json()["detail"].lower()

        # 4. User requests a unique workspace first
        pending_name = f"InFlight Brand {suffix}"
        req_res = await client.post(
            "/v1/workspaces/requests",
            headers=user_headers,
            json={"proposed_name": pending_name},
        )
        assert req_res.status_code == 201
        request_id = req_res.json()["id"]

        # 5. Later, an organization with that same name is registered
        reg_inflight = await client.post(
            "/v1/auth/register",
            json={
                "email": f"inflight_{suffix}@brand.com",
                "password": "Password123!",
                "full_name": "Inflight Admin",
                "org_name": pending_name,
            },
        )
        assert reg_inflight.status_code == 201

        # 6. Super Admin lists requests; duplicate_warning must be True
        admin_list = await client.get("/v1/workspaces/requests/admin", headers=sa_headers)
        req_item = next(r for r in admin_list.json() if r["id"] == request_id)
        assert req_item["duplicate_warning"] is True

        # 7. Super Admin rejects with reason
        rej_res = await client.post(
            f"/v1/workspaces/requests/admin/{request_id}/reject",
            headers=sa_headers,
            json={"rejection_reason": "An organization with this identity already exists."},
        )
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "rejected"
        assert rej_res.json()["rejection_reason"] == "An organization with this identity already exists."

        # 8. User receives rejection notification
        notifs = await client.get("/v1/notifications", headers=user_headers)
        assert any("declined" in n["title"].lower() or "not approved" in n["message"].lower() for n in notifs.json()["items"])


@pytest.mark.asyncio
async def test_workspace_register_and_request_gating():
    """Validates that registering a workspace request leaves account pending and blocks access until Super Admin approves."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Super Admin exists
        sa_email = f"sa_gate_{suffix}@leadflow.io"
        await create_test_superuser(session_factory, sa_email, "SuperPass123!")
        sa_login = await client.post(
            "/v1/auth/login",
            json={"email": sa_email, "password": "SuperPass123!"},
        )
        assert sa_login.status_code == 200
        sa_token = sa_login.json()["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}

        # 2. User registers and requests workspace creation (Unauthenticated)
        applicant_email = f"lead_{suffix}@startup.com"
        applicant_pass = "Password123!"
        proposed_name = f"Venture Labs {suffix}"

        reg_ws = await client.post(
            "/v1/workspaces/requests/register-and-request",
            json={
                "full_name": "Applicant Leader",
                "email": applicant_email,
                "password": applicant_pass,
                "org_name": proposed_name,
            },
        )
        assert reg_ws.status_code == 201, reg_ws.text
        data = reg_ws.json()
        assert data["status"] == "pending"
        assert data["proposed_name"] == proposed_name
        req_id = data["id"]

        # 3. User attempts to login before approval -> blocked with 403 and 24hr notice
        pre_login = await client.post(
            "/v1/auth/login",
            json={"email": applicant_email, "password": applicant_pass},
        )
        assert pre_login.status_code == 403
        assert "super admin" in pre_login.json()["detail"].lower()
        assert "24" in pre_login.json()["detail"]

        # 4. Super Admin approves the workspace creation request
        approve_res = await client.post(
            f"/v1/workspaces/requests/admin/{req_id}/approve",
            headers=sa_headers,
        )
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "approved"

        # 5. After approval, user can now log in successfully
        post_login = await client.post(
            "/v1/auth/login",
            json={"email": applicant_email, "password": applicant_pass},
        )
        assert post_login.status_code == 200
        assert post_login.json()["role"] == "owner"
        assert post_login.json()["access_token"] is not None
