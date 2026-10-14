import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_org_admin_role_transfer_lifecycle():
    """Validates atomic transfer of organisation administration, immediate session invalidation, and role restrictions."""
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = uuid.uuid4().hex[:6]

        # 1. Register Org Admin & Workspace
        admin_email = f"lead_admin_{unique_suffix}@example.com"
        reg_res = await client.post(
            "/v1/auth/register",
            json={
                "email": admin_email,
                "password": "Password123!",
                "full_name": "Original Admin",
                "org_name": f"Pinnacle Systems {unique_suffix}",
            },
        )
        assert reg_res.status_code == 201
        admin_tokens = reg_res.json()
        org_id = admin_tokens["org_id"]
        admin_user_id = admin_tokens["user_id"]
        admin_access_token = admin_tokens["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_access_token}"}

        # 2. Register a second user to become a team member
        colleague_email = f"colleague_{unique_suffix}@example.com"
        reg2_res = await client.post(
            "/v1/auth/register",
            json={
                "email": colleague_email,
                "password": "Password123!",
                "full_name": "Alex Member",
                "org_name": f"Separate Org {unique_suffix}",
            },
        )
        assert reg2_res.status_code == 201
        colleague_id = reg2_res.json()["user_id"]
        colleague_token = reg2_res.json()["access_token"]

        # Add colleague as an analyst member to Pinnacle Systems
        add_mem_res = await client.post(
            "/v1/orgs/members",
            headers=admin_headers,
            json={"email": colleague_email, "role": "analyst"},
        )
        assert add_mem_res.status_code == 201

        # 3. List organisation members
        members_res = await client.get(f"/v1/orgs/{org_id}/members", headers=admin_headers)
        assert members_res.status_code == 200
        members = members_res.json()
        assert len(members) == 2

        # 4. Attempt transfer to self - must fail
        self_transfer_res = await client.post(
            f"/v1/orgs/{org_id}/transfer-admin",
            headers=admin_headers,
            json={"target_user_id": admin_user_id},
        )
        assert self_transfer_res.status_code == 400
        assert "to yourself" in self_transfer_res.json()["detail"].lower()

        # 5. Attempt transfer to non-member - must fail
        outsider_email = f"outsider_{unique_suffix}@example.com"
        reg3_res = await client.post(
            "/v1/auth/register",
            json={
                "email": outsider_email,
                "password": "Password123!",
                "full_name": "Outsider User",
                "org_name": f"Outsider Org {unique_suffix}",
            },
        )
        outsider_id = reg3_res.json()["user_id"]
        outsider_transfer = await client.post(
            f"/v1/orgs/{org_id}/transfer-admin",
            headers=admin_headers,
            json={"target_user_id": outsider_id},
        )
        assert outsider_transfer.status_code == 400
        assert "not a member" in outsider_transfer.json()["detail"].lower()

        # 6. Execute successful atomic role transfer to colleague
        transfer_res = await client.post(
            f"/v1/orgs/{org_id}/transfer-admin",
            headers=admin_headers,
            json={"target_user_id": colleague_id},
        )
        assert transfer_res.status_code == 200
        transfer_data = transfer_res.json()
        assert transfer_data["target_role"] in ["owner", "admin"]
        assert transfer_data["previous_admin_role"] == "analyst"

        # 7. Immediate session invalidation check:
        # The actor's previous token should now be rejected due to user session revocation
        revoked_check = await client.get("/v1/auth/me", headers=admin_headers)
        assert revoked_check.status_code == 401
        assert "revoked" in revoked_check.json()["detail"].lower()

        # 8. When previous admin logs in again, they have Analyst role in this org
        relogin_res = await client.post(
            "/v1/auth/login",
            json={"email": admin_email, "password": "Password123!", "org_id": org_id},
        )
        assert relogin_res.status_code == 200
        assert relogin_res.json()["role"] == "analyst"
        new_actor_headers = {"Authorization": f"Bearer {relogin_res.json()['access_token']}"}

        # Attempting an admin-only action (adding member) as Analyst must now be 403 Forbidden!
        forbidden_action = await client.post(
            "/v1/orgs/members",
            headers=new_actor_headers,
            json={"email": outsider_email, "role": "analyst"},
        )
        assert forbidden_action.status_code == 403
