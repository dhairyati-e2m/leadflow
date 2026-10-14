import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.database import get_session_factory
from backend.app.core.security import hash_password
from backend.app.main import app
from backend.app.models.entities import Membership, Organization, User


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
async def test_access_request_lifecycle_and_permissions():
    """Tests complete access request flow: submit, notify, approve with role, reject, deduplication, and isolation."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]
        org_name = f"Target Enterprise {suffix}"

        # 1. Register Org Admin & Org
        admin_email = f"admin_{suffix}@target.com"
        reg_admin = await client.post(
            "/v1/auth/register",
            json={
                "email": admin_email,
                "password": "Password123!",
                "full_name": "Target Org Admin",
                "org_name": org_name,
            },
        )
        assert reg_admin.status_code == 201
        org_id = reg_admin.json()["org_id"]
        admin_token = reg_admin.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Register Requester User in their own temporary workspace
        requester_email = f"requester_{suffix}@client.com"
        reg_req = await client.post(
            "/v1/auth/register",
            json={
                "email": requester_email,
                "password": "Password123!",
                "full_name": "Alice Requester",
                "org_name": f"Alice Workspace {suffix}",
            },
        )
        assert reg_req.status_code == 201
        requester_token = reg_req.json()["access_token"]
        requester_headers = {"Authorization": f"Bearer {requester_token}"}

        # 3. Requester submits access request to Target Enterprise with client_id
        req_res = await client.post(
            "/v1/orgs/access-requests",
            headers=requester_headers,
            json={
                "org_name": org_name,
                "client_id": "CLIENT-REF-9921",
                "note": "Requesting portal access as account lead.",
            },
        )
        assert req_res.status_code == 201, req_res.text
        req_data = req_res.json()
        assert req_data["org_id"] == org_id
        assert req_data["client_id"] == "CLIENT-REF-9921"
        assert req_data["status"] == "pending"
        request_id = req_data["id"]

        # 4. Requester attempting duplicate pending request is blocked with 409
        dup_res = await client.post(
            "/v1/orgs/access-requests",
            headers=requester_headers,
            json={
                "org_name": org_name,
                "client_id": "CLIENT-REF-9921",
            },
        )
        assert dup_res.status_code == 409
        assert "pending access request" in dup_res.json()["detail"].lower()

        # 5. Org Admin receives persistent notification
        notif_res = await client.get("/v1/notifications", headers=admin_headers)
        assert notif_res.status_code == 200
        notifs = notif_res.json()["items"]
        assert len(notifs) >= 1
        assert any("access request" in n["title"].lower() for n in notifs)

        # 6. Org Admin views pending requests for their org
        list_res = await client.get(f"/v1/orgs/access-requests/{org_id}", headers=admin_headers)
        assert list_res.status_code == 200
        req_items = list_res.json()
        assert len(req_items) == 1
        assert req_items[0]["id"] == request_id
        assert req_items[0]["user_email"] == requester_email

        # 7. Unrelated third user cannot view Target Org's requests (403)
        third_email = f"third_{suffix}@other.com"
        reg_third = await client.post(
            "/v1/auth/register",
            json={
                "email": third_email,
                "password": "Password123!",
                "full_name": "Third Party",
                "org_name": f"Other Org {suffix}",
            },
        )
        third_headers = {"Authorization": f"Bearer {reg_third.json()['access_token']}"}
        forbidden_view = await client.get(f"/v1/orgs/access-requests/{org_id}", headers=third_headers)
        assert forbidden_view.status_code == 403

        # 8. Org Admin approves request granting client_viewer role
        approve_res = await client.post(
            f"/v1/orgs/access-requests/{org_id}/{request_id}/approve",
            headers=admin_headers,
            json={"role": "client_viewer"},
        )
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "approved"

        # 9. Requester receives approval notification and membership
        req_notif_res = await client.get("/v1/notifications", headers=requester_headers)
        assert req_notif_res.status_code == 200
        req_notifs = req_notif_res.json()["items"]
        assert any("approved" in n["title"].lower() for n in req_notifs)

        # Requester profile check reveals new membership
        me_res = await client.get("/v1/auth/me", headers=requester_headers)
        assert me_res.status_code == 200
        memberships = me_res.json()["memberships"]
        target_membership = next((m for m in memberships if m["org_id"] == org_id), None)
        assert target_membership is not None
        assert target_membership["role"] == "client_viewer"

        # 10. Attempting to submit another request when already a member fails with 400
        member_again = await client.post(
            "/v1/orgs/access-requests",
            headers=requester_headers,
            json={"org_name": org_name},
        )
        assert member_again.status_code == 400
        assert "already a member" in member_again.json()["detail"].lower()


@pytest.mark.asyncio
async def test_access_request_rejection_flow():
    """Tests rejection of an access request with rejection reason and notification."""
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]
        org_name = f"Reject Org {suffix}"

        # 1. Setup Org Admin and User
        reg_admin = await client.post(
            "/v1/auth/register",
            json={
                "email": f"admin_{suffix}@rej.com",
                "password": "Password123!",
                "full_name": "Admin Rej",
                "org_name": org_name,
            },
        )
        org_id = reg_admin.json()["org_id"]
        admin_headers = {"Authorization": f"Bearer {reg_admin.json()['access_token']}"}

        reg_user = await client.post(
            "/v1/auth/register",
            json={
                "email": f"user_{suffix}@rej.com",
                "password": "Password123!",
                "full_name": "User Rej",
                "org_name": f"User Workspace {suffix}",
            },
        )
        user_headers = {"Authorization": f"Bearer {reg_user.json()['access_token']}"}

        # 2. Submit access request
        req_res = await client.post(
            "/v1/orgs/access-requests",
            headers=user_headers,
            json={"org_name": org_name, "client_id": "UNKNOWN-ID"},
        )
        request_id = req_res.json()["id"]

        # 3. Reject access request
        rej_res = await client.post(
            f"/v1/orgs/access-requests/{org_id}/{request_id}/reject",
            headers=admin_headers,
            json={"rejection_reason": "Client ID unverified in billing records."},
        )
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "rejected"
        assert rej_res.json()["rejection_reason"] == "Client ID unverified in billing records."

        # 4. User receives rejection notification
        user_notifs = await client.get("/v1/notifications", headers=user_headers)
        assert any("declined" in n["title"].lower() or "not approved" in n["message"].lower() for n in user_notifs.json()["items"])
