import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_duplicate_organization_registration_prevention():
    """Validates that registering an organization with identical, case-variant, or whitespace-variant names is blocked with 409."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = uuid.uuid4().hex[:6]
        base_org_name = f"Acme Innovations {unique_suffix}"

        # 1. Register first organization
        user1_email = f"user1_{unique_suffix}@example.com"
        res1 = await client.post(
            "/v1/auth/register",
            json={
                "email": user1_email,
                "password": "Password123!",
                "full_name": "First Admin",
                "org_name": base_org_name,
            },
        )
        assert res1.status_code == 201, res1.text

        # 2. Attempt duplicate registration with exact name
        user2_email = f"user2_{unique_suffix}@example.com"
        res2 = await client.post(
            "/v1/auth/register",
            json={
                "email": user2_email,
                "password": "Password123!",
                "full_name": "Second User",
                "org_name": base_org_name,
            },
        )
        assert res2.status_code == 409
        expected_msg = "An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access."
        assert res2.json()["detail"] == expected_msg

        # 3. Attempt duplicate with different casing (e.g. UPPERCASE)
        user3_email = f"user3_{unique_suffix}@example.com"
        res3 = await client.post(
            "/v1/auth/register",
            json={
                "email": user3_email,
                "password": "Password123!",
                "full_name": "Third User",
                "org_name": base_org_name.upper(),
            },
        )
        assert res3.status_code == 409
        assert res3.json()["detail"] == expected_msg

        # 4. Attempt duplicate with leading/trailing spaces and multiple internal spaces
        user4_email = f"user4_{unique_suffix}@example.com"
        spaced_org_name = f"   Acme    Innovations   {unique_suffix}   "
        res4 = await client.post(
            "/v1/auth/register",
            json={
                "email": user4_email,
                "password": "Password123!",
                "full_name": "Fourth User",
                "org_name": spaced_org_name,
            },
        )
        assert res4.status_code == 409
        assert res4.json()["detail"] == expected_msg


@pytest.mark.asyncio
async def test_create_additional_org_duplicate_prevention():
    """Validates that authenticated POST /v1/orgs also blocks duplicate normalized organization names."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = uuid.uuid4().hex[:6]
        org_name = f"Global Nexus {unique_suffix}"

        # Register user
        user_email = f"nexus_admin_{unique_suffix}@example.com"
        reg_res = await client.post(
            "/v1/auth/register",
            json={
                "email": user_email,
                "password": "Password123!",
                "full_name": "Nexus Admin",
                "org_name": org_name,
            },
        )
        assert reg_res.status_code == 201
        access_token = reg_res.json()["access_token"]

        # Attempt to create duplicate org via POST /v1/orgs
        create_res = await client.post(
            "/v1/orgs",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"name": f"  global   nexus  {unique_suffix}  "},
        )
        assert create_res.status_code == 409
        expected_msg = "An organisation with these details already exists. If you belong to this organisation, contact its administrator or request access."
        assert create_res.json()["detail"] == expected_msg
