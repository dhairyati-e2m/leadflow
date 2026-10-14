from datetime import timedelta
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.app.core.database import get_session_factory
from backend.app.core.security import create_access_token
from backend.app.main import app
from backend.app.models.entities import Membership, Organization, User


@pytest.mark.asyncio
async def test_auth_token_expiration_and_revocation_lifecycle():
    """Validates token expiration, Redis revocation, and logout behavior."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register a test user and tenant
        unique_email = f"auth_test_{uuid.uuid4().hex[:8]}@example.com"
        reg_res = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Lifecycle User",
            "org_name": f"Lifecycle Org {uuid.uuid4().hex[:6]}",
        })
        assert reg_res.status_code == 201
        tokens = reg_res.json()
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        org_id = tokens["org_id"]
        user_id = tokens["user_id"]

        # 2. Access protected endpoint with valid token
        me_res = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me_res.status_code == 200
        assert me_res.json()["email"] == unique_email

        # 3. Test expired access token returns "Token has expired"
        expired_token = create_access_token(
            user_id=user_id,
            org_id=org_id,
            role="owner",
            expires_delta=timedelta(seconds=-10),  # expired 10s ago
        )
        expired_res = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert expired_res.status_code == 401
        assert "Token has expired" in expired_res.json()["detail"]

        # 4. Test logout revokes token
        logout_res = await client.post(
            "/v1/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"refresh_token": refresh_token},
        )
        assert logout_res.status_code == 200

        # 5. Accessing with revoked access token must fail
        revoked_me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert revoked_me.status_code == 401
        assert "revoked" in revoked_me.json()["detail"].lower()

        # 6. Using revoked refresh token must fail
        revoked_refresh = await client.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert revoked_refresh.status_code == 401
        assert "revoked" in revoked_refresh.json()["detail"].lower()


@pytest.mark.asyncio
async def test_auth_refresh_preserves_tenant_and_rejects_inactive_user():
    """Validates that token refresh respects org_id context and rejects inactive accounts."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register user
        unique_email = f"multi_tenant_{uuid.uuid4().hex[:8]}@example.com"
        reg_res = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Multi Tenant User",
            "org_name": f"Org Alpha {uuid.uuid4().hex[:6]}",
        })
        assert reg_res.status_code == 201
        data1 = reg_res.json()
        user_id = data1["user_id"]
        org_a_id = data1["org_id"]
        refresh_token = data1["refresh_token"]

        # 2. Add second organization for this user in DB
        session_factory = get_session_factory()
        org_b_id = str(uuid.uuid4())
        async with session_factory() as session:
            org_b = Organization(id=org_b_id, name=f"Org Beta {uuid.uuid4().hex[:6]}", slug=f"beta-{org_b_id[:6]}", is_active=True)
            session.add(org_b)
            await session.flush()
            mem_b = Membership(org_id=org_b_id, user_id=user_id, role="admin")
            session.add(mem_b)
            await session.commit()

        # 3. Refresh with explicit target org_b_id -> must issue token for Org B!
        ref_b_res = await client.post("/v1/auth/refresh", json={
            "refresh_token": refresh_token,
            "org_id": org_b_id,
        })
        assert ref_b_res.status_code == 200
        ref_b_data = ref_b_res.json()
        assert ref_b_data["org_id"] == org_b_id
        assert ref_b_data["role"] == "admin"
        new_refresh = ref_b_data["refresh_token"]

        # 4. Old refresh token was rotated -> re-using old refresh token must be rejected!
        old_ref_res = await client.post("/v1/auth/refresh", json={
            "refresh_token": refresh_token,
            "org_id": org_b_id,
        })
        assert old_ref_res.status_code == 401

        # 5. Deactivate user in DB
        async with session_factory() as session:
            stmt = select(User).where(User.id == user_id)
            user_obj = (await session.execute(stmt)).scalars().first()
            user_obj.is_active = False
            await session.commit()

        # 6. Refreshing while user is inactive must fail with 401
        inactive_ref = await client.post("/v1/auth/refresh", json={
            "refresh_token": new_refresh,
            "org_id": org_b_id,
        })
        assert inactive_ref.status_code == 401
        assert "deactivated" in inactive_ref.json()["detail"].lower()
