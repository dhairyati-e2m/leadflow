import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.database import get_session_factory
from backend.app.core.security import hash_password
from backend.app.main import app
from backend.app.models.entities import User


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
async def test_dashboard_role_resolution_and_isolation():
    """Validates authoritative server-side role resolution and multi-tenant data boundary isolation."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Standard Org Admin
        standard_email = f"standard_{suffix}@example.com"
        reg1 = await client.post(
            "/v1/auth/register",
            json={
                "email": standard_email,
                "password": "Password123!",
                "full_name": "Standard Admin",
                "org_name": f"Tenant Alpha {suffix}",
            },
        )
        assert reg1.status_code == 201
        token1 = reg1.json()["access_token"]
        org1_id = reg1.json()["org_id"]

        # Verify /me returns is_superuser=False
        me1 = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token1}"})
        assert me1.status_code == 200
        data1 = me1.json()
        assert data1["is_superuser"] is False
        assert data1["memberships"][0]["org_id"] == org1_id

        # 2. Super Admin user
        super_email = f"root_admin_{suffix}@example.com"
        await create_test_superuser(session_factory, super_email, "SuperAdmin123!")

        super_login = await client.post(
            "/v1/auth/login",
            json={"email": super_email, "password": "SuperAdmin123!"},
        )
        assert super_login.status_code == 200
        super_token = super_login.json()["access_token"]

        # Verify /me returns is_superuser=True
        me_super = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {super_token}"})
        assert me_super.status_code == 200
        assert me_super.json()["is_superuser"] is True

        # 3. Org Admin cannot access cross-tenant Super Admin endpoints
        cross_res = await client.get("/v1/admin/orgs", headers={"Authorization": f"Bearer {token1}"})
        assert cross_res.status_code == 403

        # Super Admin CAN access cross-tenant endpoints
        super_orgs_res = await client.get("/v1/admin/orgs", headers={"Authorization": f"Bearer {super_token}"})
        assert super_orgs_res.status_code == 200
        org_ids = [o["id"] for o in super_orgs_res.json()]
        assert org1_id in org_ids
