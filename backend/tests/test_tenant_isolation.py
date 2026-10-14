import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session_factory, set_rls_tenant_context
from backend.app.main import app
from backend.app.models.entities import Lead, Membership, Organization, User
from backend.app.repositories.leads import LeadRepository


@pytest.mark.asyncio
async def test_auth_registration_and_login_flow():
    """Verify registration, password hashing, and login token issuance."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
        reg_payload = {
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Test User",
            "org_name": f"Test Org Inc {uuid.uuid4().hex[:6]}",
        }
        res = await client.post("/v1/auth/register", json=reg_payload)
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["role"] == "owner"
        assert data["org_id"]

        # Test login with issued credentials
        login_res = await client.post("/v1/auth/login", json={
            "email": unique_email,
            "password": "Password123!",
        })
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data["access_token"]
        assert login_data["org_id"] == data["org_id"]

        # Test invalid password rejection
        bad_login = await client.post("/v1/auth/login", json={
            "email": unique_email,
            "password": "WrongPassword!",
        })
        assert bad_login.status_code == 401


@pytest.mark.asyncio
async def test_cross_tenant_isolation_repository_and_rls():
    """
    Critical security test:
    Validates that Tenant Alpha cannot read, query, or mutate Tenant Beta records
    under any condition, enforcing defense-in-depth via both repository scoping and PostgreSQL RLS.
    """
    session_factory = get_session_factory()
    org_a_id = str(uuid.uuid4())
    org_b_id = str(uuid.uuid4())

    async with session_factory() as session:
        # 1. Create Organization Alpha and Organization Beta
        org_a = Organization(id=org_a_id, name=f"Tenant Alpha {org_a_id[:6]}", slug=f"alpha-{org_a_id[:6]}", is_active=True)
        org_b = Organization(id=org_b_id, name=f"Tenant Beta {org_b_id[:6]}", slug=f"beta-{org_b_id[:6]}", is_active=True)
        session.add_all([org_a, org_b])
        await session.commit()

    # 2. Insert Lead A in Org Alpha context
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_a_id)
        repo_a = LeadRepository(session, org_a_id)
        lead_a = await repo_a.create(
            company_name="Alpha Corp",
            domain="alpha-corp.com",
            pipeline_state="new",
        )
        await session.commit()
        lead_a_id = lead_a.id

    # 3. Insert Lead B in Org Beta context
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_b_id)
        repo_b = LeadRepository(session, org_b_id)
        lead_b = await repo_b.create(
            company_name="Beta Corp",
            domain="beta-corp.com",
            pipeline_state="new",
        )
        await session.commit()
        lead_b_id = lead_b.id

    # 4. Verify Tenant Alpha queries:
    # Must ONLY see Lead A; Lead B must be completely invisible!
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_a_id)
        repo_a = LeadRepository(session, org_a_id)

        # List all for Org A
        alpha_leads = await repo_a.list_all()
        domains = [l.domain for l in alpha_leads]
        assert "alpha-corp.com" in domains
        assert "beta-corp.com" not in domains

        # Query Lead B by ID from Tenant Alpha context
        cross_read = await repo_a.get_by_id(lead_b_id)
        assert cross_read is None, "Cross-tenant read violation: Org A was able to read Org B lead!"

        # Query Lead B by domain from Tenant Alpha context
        cross_domain = await repo_a.get_by_domain("beta-corp.com")
        assert cross_domain is None, "Cross-tenant domain read violation!"

        # Attempt to delete Lead B from Tenant Alpha context
        deleted = await repo_a.delete_by_id(lead_b_id)
        assert deleted is False, "Cross-tenant mutation violation: Org A was able to delete Org B lead!"

    # 5. Verify that Lead B remains intact in Tenant Beta context
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_b_id)
        repo_b = LeadRepository(session, org_b_id)
        b_lead_verify = await repo_b.get_by_id(lead_b_id)
        assert b_lead_verify is not None
        assert b_lead_verify.company_name == "Beta Corp"

    # 6. Low-level PostgreSQL RLS bypass prevention test:
    # Even raw unrestricted SQL 'SELECT * FROM leads' inside Org A's transaction
    # MUST be filtered by PostgreSQL kernel level RLS policy to return ONLY Org A rows.
    async with session_factory() as session:
        await set_rls_tenant_context(session, org_a_id)
        raw_result = await session.execute(text("SELECT id, org_id, domain FROM leads"))
        rows = raw_result.fetchall()
        for row in rows:
            assert row.org_id == org_a_id, "Postgres RLS kernel leak: Row from another org returned!"


@pytest.mark.asyncio
async def test_auth_token_refresh_and_me():
    """Verify JWT refresh cycle and current user profile endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        unique_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
        reg = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Refresh Tester",
            "org_name": f"Refresh Inc {uuid.uuid4().hex[:6]}",
        })
        assert reg.status_code == 201
        data = reg.json()
        access_token = data["access_token"]
        refresh_token = data["refresh_token"]

        # 1. Fetch user profile with valid access token
        me_res = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == unique_email
        assert me_data["full_name"] == "Refresh Tester"

        # 2. Fetch user profile without token -> 401
        unauth_res = await client.get("/v1/auth/me")
        assert unauth_res.status_code == 401

        # 3. Rotate tokens with refresh_token
        refresh_res = await client.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert refresh_res.status_code == 200
        refreshed = refresh_res.json()
        assert "access_token" in refreshed
        assert "refresh_token" in refreshed
        assert refreshed["access_token"] != access_token

        # 4. Use new access token to query /me
        new_me = await client.get("/v1/auth/me", headers={"Authorization": f"Bearer {refreshed['access_token']}"})
        assert new_me.status_code == 200


@pytest.mark.asyncio
async def test_organization_lifecycle_and_switching():
    """Test creating additional orgs, listing memberships, and switching active org context."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user in Org 1
        reg = await client.post("/v1/auth/register", json={
            "email": f"multi_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Multi-Tenant Owner",
            "org_name": f"First Organization {uuid.uuid4().hex[:6]}",
        })
        data = reg.json()
        token1 = data["access_token"]
        org1_id = data["org_id"]

        headers1 = {"Authorization": f"Bearer {token1}"}

        # 1. List user orgs -> Should contain First Organization
        orgs_res = await client.get("/v1/orgs", headers=headers1)
        assert orgs_res.status_code == 200
        org_list = orgs_res.json()
        assert len(org_list) >= 1
        assert any(o["id"] == org1_id for o in org_list)

        # 2. Create Second Organization
        create_res = await client.post("/v1/orgs", json={"name": f"Second Organization {uuid.uuid4().hex[:6]}"}, headers=headers1)
        assert create_res.status_code == 201
        org2_id = create_res.json()["id"]

        # 3. List user orgs again -> Should contain both organizations
        orgs_res2 = await client.get("/v1/orgs", headers=headers1)
        org_list2 = orgs_res2.json()
        org_ids = [o["id"] for o in org_list2]
        assert org1_id in org_ids
        assert org2_id in org_ids

        # 4. Switch context to Org 2
        switch_res = await client.post(f"/v1/orgs/{org2_id}/switch", headers=headers1)
        assert switch_res.status_code == 200
        switch_data = switch_res.json()
        token2 = switch_data["access_token"]
        assert switch_data["org_id"] == org2_id

        # 5. Attempt switching to a nonexistent or unauthorized organization -> 403
        fake_org = str(uuid.uuid4())
        bad_switch = await client.post(f"/v1/orgs/{fake_org}/switch", headers=headers1)
        assert bad_switch.status_code == 403


@pytest.mark.asyncio
async def test_rbac_authorization_enforcement():
    """Verify role-based access control (RBAC): owner, admin, analyst permissions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register owner
        owner_email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
        reg_owner = await client.post("/v1/auth/register", json={
            "email": owner_email,
            "password": "Password123!",
            "full_name": "Org Owner",
            "org_name": f"RBAC Org {uuid.uuid4().hex[:6]}",
        })
        owner_token = reg_owner.json()["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        # Register a second user (Analyst) in their own dummy org
        analyst_email = f"analyst_{uuid.uuid4().hex[:8]}@example.com"
        reg_analyst = await client.post("/v1/auth/register", json={
            "email": analyst_email,
            "password": "Password123!",
            "full_name": "Team Analyst",
            "org_name": f"Analyst Solitary Inc {uuid.uuid4().hex[:6]}",
        })

        # Owner adds Analyst to RBAC Org with role 'analyst'
        add_res = await client.post("/v1/orgs/members", json={
            "email": analyst_email,
            "role": "analyst",
        }, headers=owner_headers)
        assert add_res.status_code == 201

        # Analyst logs in and switches to RBAC Org
        analyst_login = await client.post("/v1/auth/login", json={
            "email": analyst_email,
            "password": "Password123!",
        })
        analyst_org1_token = analyst_login.json()["access_token"]
        rbac_org_id = reg_owner.json()["org_id"]

        analyst_switch = await client.post(
            f"/v1/orgs/{rbac_org_id}/switch",
            headers={"Authorization": f"Bearer {analyst_org1_token}"},
        )
        assert analyst_switch.status_code == 200
        analyst_rbac_token = analyst_switch.json()["access_token"]
        analyst_headers = {"Authorization": f"Bearer {analyst_rbac_token}"}

        # Analyst attempts an owner/admin restricted action (e.g. adding a new member) -> Must receive 403 Forbidden
        forbidden_res = await client.post("/v1/orgs/members", json={
            "email": "another@example.com",
            "role": "analyst",
        }, headers=analyst_headers)
        assert forbidden_res.status_code == 403
        assert "Action requires one of the following roles" in forbidden_res.json()["detail"]

