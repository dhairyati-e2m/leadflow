import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.app.core.database import get_session_factory
from backend.app.core.security import hash_password
from backend.app.main import app
from backend.app.models.entities import Membership, Organization, User


async def create_test_superuser(session_factory, email: str, password: str = "SuperAdmin123!") -> User:
    """Helper to create an active superuser in the database."""
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
async def test_super_admin_org_admin_management_lifecycle():
    """Validates Super Admin ability to list, assign, and remove organisation admins with last-admin guard."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = uuid.uuid4().hex[:6]

        # 1. Register a standard organization with an initial admin
        initial_admin_email = f"initial_admin_{unique_suffix}@example.com"
        reg_res = await client.post(
            "/v1/auth/register",
            json={
                "email": initial_admin_email,
                "password": "Password123!",
                "full_name": "Initial Admin",
                "org_name": f"Enterprise Org {unique_suffix}",
            },
        )
        assert reg_res.status_code == 201
        org_id = reg_res.json()["org_id"]
        initial_admin_id = reg_res.json()["user_id"]
        initial_token = reg_res.json()["access_token"]

        # 2. Register a second user (without org admin role in Enterprise Org)
        second_user_email = f"colleague_{unique_suffix}@example.com"
        reg2_res = await client.post(
            "/v1/auth/register",
            json={
                "email": second_user_email,
                "password": "Password123!",
                "full_name": "Future Admin",
                "org_name": f"Colleague Org {unique_suffix}",
            },
        )
        assert reg2_res.status_code == 201
        second_user_id = reg2_res.json()["user_id"]

        # 3. Create a Super Admin account
        super_email = f"superadmin_{unique_suffix}@leadflow.io"
        await create_test_superuser(session_factory, super_email, "SuperAdmin123!")

        # Log in as Super Admin
        login_res = await client.post(
            "/v1/auth/login",
            json={"email": super_email, "password": "SuperAdmin123!"},
        )
        assert login_res.status_code == 200, login_res.text
        super_token = login_res.json()["access_token"]
        super_headers = {"Authorization": f"Bearer {super_token}"}

        # 4. Super Admin lists org admins for Enterprise Org
        list_res = await client.get(f"/v1/admin/orgs/{org_id}/admins", headers=super_headers)
        assert list_res.status_code == 200
        admins_list = list_res.json()
        assert len(admins_list) == 1
        assert admins_list[0]["email"] == initial_admin_email

        # 5. Non-superuser cannot access Super Admin endpoint (Forbidden)
        forbidden_res = await client.get(
            f"/v1/admin/orgs/{org_id}/admins",
            headers={"Authorization": f"Bearer {initial_token}"},
        )
        assert forbidden_res.status_code == 403

        # 6. Attempt assigning an unregistered email returns 404 with guidance
        unregistered_email = f"unregistered_{unique_suffix}@example.com"
        assign_unreg_res = await client.post(
            f"/v1/admin/orgs/{org_id}/admins",
            headers=super_headers,
            json={"email": unregistered_email},
        )
        assert assign_unreg_res.status_code == 404
        assert "must register an account" in assign_unreg_res.json()["detail"]

        # 7. Super Admin successfully assigns second user as Org Admin
        assign_res = await client.post(
            f"/v1/admin/orgs/{org_id}/admins",
            headers=super_headers,
            json={"email": second_user_email},
        )
        assert assign_res.status_code == 200
        assert assign_res.json()["email"] == second_user_email
        assert assign_res.json()["role"] == "admin"

        # Verify admin list now has 2 admins
        list_res2 = await client.get(f"/v1/admin/orgs/{org_id}/admins", headers=super_headers)
        assert list_res2.status_code == 200
        assert len(list_res2.json()) == 2

        # 8. Super Admin removes the second admin (now 2 admins exist, so removal is allowed)
        remove_res = await client.delete(
            f"/v1/admin/orgs/{org_id}/admins/{second_user_id}",
            headers=super_headers,
        )
        assert remove_res.status_code == 200
        assert remove_res.json()["new_role"] == "analyst"

        # Verify admin list is back to 1 admin
        list_res3 = await client.get(f"/v1/admin/orgs/{org_id}/admins", headers=super_headers)
        assert list_res3.status_code == 200
        assert len(list_res3.json()) == 1

        # 9. Last-Admin Protection: Attempting to remove the last admin must fail with 400
        remove_last_res = await client.delete(
            f"/v1/admin/orgs/{org_id}/admins/{initial_admin_id}",
            headers=super_headers,
        )
        assert remove_last_res.status_code == 400
        assert "last administrator" in remove_last_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_super_admin_create_org_and_assign_admin():
    """Validates Super Admin creating a brand-new organization and assigning the org admin email."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = uuid.uuid4().hex[:6]

        # 1. Create a Super Admin account
        super_email = f"super_{unique_suffix}@leadflow.io"
        await create_test_superuser(session_factory, super_email, "SuperAdmin123!")

        login_res = await client.post(
            "/v1/auth/login",
            json={"email": super_email, "password": "SuperAdmin123!"},
        )
        assert login_res.status_code == 200
        super_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

        # 2. Super Admin provisions a new organisation and assigns an admin email
        new_org_name = f"Apex Medical Technologies {unique_suffix}"
        admin_email = f"sarah_{unique_suffix}@apexmedical.com"
        create_res = await client.post(
            "/v1/admin/orgs",
            headers=super_headers,
            json={
                "name": new_org_name,
                "admin_email": admin_email,
                "admin_full_name": "Dr. Sarah Apex",
                "monthly_lead_quota": 250,
            },
        )
        assert create_res.status_code == 201, create_res.text
        created_org = create_res.json()
        assert created_org["name"] == new_org_name
        assert created_org["monthly_lead_quota"] == 250
        assert created_org["user_count"] == 1
        org_id = created_org["id"]

        # 3. Verify duplicate organisation is blocked with 409
        dup_res = await client.post(
            "/v1/admin/orgs",
            headers=super_headers,
            json={
                "name": new_org_name,
                "admin_email": f"other_{unique_suffix}@apex.com",
            },
        )
        assert dup_res.status_code == 409
        assert "already exists" in dup_res.json()["detail"].lower()

        # 4. Verify the newly assigned Org Admin is listed as owner of the org
        admins_res = await client.get(f"/v1/admin/orgs/{org_id}/admins", headers=super_headers)
        assert admins_res.status_code == 200
        admins_data = admins_res.json()
        assert len(admins_data) == 1
        assert admins_data[0]["email"] == admin_email
        assert admins_data[0]["role"] == "owner"
