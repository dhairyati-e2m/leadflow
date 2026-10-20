from datetime import datetime, timedelta, timezone
import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
import jwt

from backend.app.core.config import settings
from backend.app.core.encryption import (
    decrypt_credentials,
    encrypt_credentials,
    generate_oauth_state,
    validate_oauth_state,
)
from backend.app.main import app
from backend.app.models.entities import CRMConnection, CRMSync, Lead
from backend.app.providers.hubspot import HUBSPOT_SCOPES, HubSpotProvider


# ------------------------------------------------------------------------------
# 1. Cryptographic Security & Tamper-Resistance Tests
# ------------------------------------------------------------------------------

def test_credential_encryption_and_tamper_resistance():
    """Verifies authenticated symmetric encryption for CRM credentials."""
    creds = {
        "access_token": "secret_access_token_12345",
        "refresh_token": "secret_refresh_token_67890",
        "expires_at": int(time.time()) + 1800,
        "portal_id": "999888",
    }

    ciphertext = encrypt_credentials(creds)
    assert isinstance(ciphertext, str)
    assert "secret_access_token" not in ciphertext  # Plaintext never stored

    decrypted = decrypt_credentials(ciphertext)
    assert decrypted["access_token"] == creds["access_token"]
    assert decrypted["refresh_token"] == creds["refresh_token"]
    assert decrypted["portal_id"] == "999888"

    # Tampering test: corrupting any byte must trigger a ValueError
    tampered = ciphertext[:-4] + "AAAA"
    with pytest.raises(ValueError):
        decrypt_credentials(tampered)

    # Empty ciphertext test
    with pytest.raises(ValueError):
        decrypt_credentials("")


@pytest.mark.asyncio
async def test_oauth_state_generation_and_validation():
    """Verifies OAuth state cryptographic binding, expiration, and replay defense."""
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    org_id = f"org_{uuid.uuid4().hex[:8]}"

    # 1. Valid state validation
    state = generate_oauth_state(user_id=user_id, org_id=org_id, ttl_minutes=5)
    payload = await validate_oauth_state(state, expected_user_id=user_id, expected_org_id=org_id)
    assert payload["sub"] == user_id
    assert payload["org_id"] == org_id

    # 2. Replay defense: second validation of the exact same state MUST be rejected
    with pytest.raises(ValueError, match="replay detected"):
        await validate_oauth_state(state)

    # 3. Expiration defense: state issued with negative expiry MUST be rejected
    expired_payload = {
        "sub": user_id,
        "org_id": org_id,
        "type": "hubspot_oauth_state",
        "nonce": str(uuid.uuid4()),
        "iat": int((datetime.now(timezone.utc) - timedelta(minutes=20)).timestamp()),
        "exp": int((datetime.now(timezone.utc) - timedelta(minutes=10)).timestamp()),
    }
    expired_state = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm="HS256")
    with pytest.raises(ValueError, match="expired"):
        await validate_oauth_state(expired_state)

    # 4. Tampered state signature MUST be rejected
    state_to_tamper = generate_oauth_state(user_id=user_id, org_id=org_id)
    tampered_state = state_to_tamper[:-5] + "XXXXX"
    with pytest.raises(ValueError, match="Invalid OAuth state"):
        await validate_oauth_state(tampered_state)

    # 5. Mismatched user or organization context MUST be rejected
    fresh_state = generate_oauth_state(user_id=user_id, org_id=org_id)
    with pytest.raises(ValueError, match="Mismatched OAuth user context"):
        await validate_oauth_state(fresh_state, expected_user_id="different_user")


# ------------------------------------------------------------------------------
# 2. HubSpot Provider Adapter Tests
# ------------------------------------------------------------------------------

def test_hubspot_provider_url_and_scopes():
    """Verifies that authorization URL contains all exact scopes and matches requirements."""
    provider = HubSpotProvider(
        client_id="test_client_id_abc",
        client_secret="test_client_secret_xyz",
        redirect_uri="http://localhost:8000/v1/settings/integrations/hubspot/callback",
        mode="mock",
    )
    auth_url = provider.build_authorization_url(state="test_state_123")
    assert "https://app.hubspot.com/oauth/authorize" in auth_url
    assert "client_id=test_client_id_abc" in auth_url
    assert "http%3A%2F%2Flocalhost%3A8000%2Fv1%2Fsettings%2Fintegrations%2Fhubspot%2Fcallback" in auth_url
    assert "state=test_state_123" in auth_url

    # Check all 5 required scopes are present
    for scope in ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.objects.companies.write"]:
        assert scope in auth_url


@pytest.mark.asyncio
async def test_hubspot_provider_mock_operations():
    """Verifies mock mode handles token exchange and sync without external HTTP traffic."""
    provider = HubSpotProvider(
        client_id="test_client_id",
        client_secret="test_secret",
        redirect_uri="http://localhost:8000/v1/settings/integrations/hubspot/callback",
        mode="mock",
    )

    # Mock token exchange
    tokens = await provider.exchange_code_for_tokens("mock_auth_code")
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["portal_id"] == "mock_portal_12345"

    # Mock sync
    sync_result = await provider.sync_lead(
        company_data={"company_name": "Acme Widgets", "domain": "acmewidgets.com"},
        contact_data={"email": "ceo@acmewidgets.com", "full_name": "Alice CEO"},
        credentials=tokens,
        mode="mock",
    )
    assert sync_result["status"] == "synced"
    assert sync_result["remote_company_id"].startswith("mock-comp-")
    assert sync_result["remote_contact_id"].startswith("mock-contact-")
    assert sync_result["associated"] is True


# ------------------------------------------------------------------------------
# 3. End-to-End API OAuth Flow & Tenant Isolation Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_hubspot_oauth_flow_and_sync_lifecycle():
    """
    Tests the complete end-to-end OAuth connection and lead sync flow:
    1. Check status (initially disconnected).
    2. Attempt to sync unapproved lead -> rejected with 400.
    3. Start OAuth authorization -> returns valid URL and state.
    4. Complete callback -> stores encrypted connection with portal_id.
    5. Check status -> returns connected=True with portal_id, zero secret leaks.
    6. Sync approved lead -> successfully marks synced and creates CRMSync log.
    7. Multi-tenant isolation: Org B cannot see or use Org A's connection.
    8. Disconnect -> marks disconnected and removes stored credentials.
    """
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Configure test settings for mock mode
        settings.PROVIDER_HUBSPOT_MODE = "mock"
        settings.HUBSPOT_CLIENT_ID = "mock_client_id_test"
        settings.HUBSPOT_CLIENT_SECRET = "mock_client_secret_test"
        settings.HUBSPOT_REDIRECT_URI = "http://localhost:8000/v1/settings/integrations/hubspot/callback"

        suffix = uuid.uuid4().hex[:6]

        # 1. Register Org A (Owner)
        reg_a = await client.post(
            "/v1/auth/register",
            json={
                "email": f"owner_a_{suffix}@company-a.com",
                "password": "Password123!",
                "full_name": "Alice Owner",
                "org_name": f"Organization A {suffix}",
            },
        )
        assert reg_a.status_code == 201
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 2. Register Org B (Owner)
        reg_b = await client.post(
            "/v1/auth/register",
            json={
                "email": f"owner_b_{suffix}@company-b.com",
                "password": "Password123!",
                "full_name": "Bob Owner",
                "org_name": f"Organization B {suffix}",
            },
        )
        assert reg_b.status_code == 201
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 3. Check initial connection status for Org A
        status_res1 = await client.get("/v1/settings/integrations/hubspot/status", headers=headers_a)
        assert status_res1.status_code == 200
        assert status_res1.json()["connected"] is False
        assert status_res1.json()["status"] == "disconnected"

        # 4. Initiate OAuth flow
        auth_res = await client.get("/v1/settings/integrations/hubspot/authorize", headers=headers_a)
        assert auth_res.status_code == 200
        auth_data = auth_res.json()
        assert "authorization_url" in auth_data
        oauth_state = auth_data["state"]

        # 5. Handle callback with bad state -> redirects to error
        bad_cb = await client.get(
            "/v1/settings/integrations/hubspot/callback",
            params={"code": "sample_code", "state": "tampered_state"},
            follow_redirects=False,
        )
        assert bad_cb.status_code == 307
        assert "hubspot_error=" in bad_cb.headers["location"]

        # 6. Handle callback with valid state & code -> redirects to success
        valid_cb = await client.get(
            "/v1/settings/integrations/hubspot/callback",
            params={"code": "valid_test_code", "state": oauth_state},
            follow_redirects=False,
        )
        assert valid_cb.status_code == 307
        assert "hubspot_connected=true" in valid_cb.headers["location"]
        assert "portal_id=" in valid_cb.headers["location"]

        # 7. Check connection status for Org A
        status_res2 = await client.get("/v1/settings/integrations/hubspot/status", headers=headers_a)
        assert status_res2.status_code == 200
        status_data = status_res2.json()
        assert status_data["connected"] is True
        assert status_data["status"] == "connected"
        assert status_data["portal_id"] == "mock_portal_12345"
        # Security audit: ensure no tokens leaked
        assert "access_token" not in status_data
        assert "refresh_token" not in status_data

        # 8. Multi-tenant isolation: Verify Org B is STILL disconnected!
        status_res_b = await client.get("/v1/settings/integrations/hubspot/status", headers=headers_b)
        assert status_res_b.status_code == 200
        assert status_res_b.json()["connected"] is False

        # 9. Create a lead in Org A
        lead_create_res = await client.post(
            "/v1/audiences/move-to-pipeline",
            headers=headers_a,
            json={
                "company_name": f"Target Tech {suffix}",
                "domain": f"targettech-{suffix}.com",
                "industry": "Software",
                "location": "Boston, MA",
                "employee_count": "50-100",
                "contact_email": f"contact@{suffix}.com",
                "contact_name": "John Target",
            },
        )
        assert lead_create_res.status_code == 201
        lead_id = lead_create_res.json()["lead_id"]

        # 10. Attempt sync while lead is in "review" state -> MUST fail with 400
        sync_fail_res = await client.post(
            f"/v1/settings/integrations/hubspot/sync/{lead_id}",
            headers=headers_a,
        )
        assert sync_fail_res.status_code == 400
        assert "Only approved leads can be synced" in sync_fail_res.json()["detail"]

        # 11. Cross-tenant isolation check: Org B attempts to sync Org A's lead -> MUST fail with 404
        cross_tenant_sync = await client.post(
            f"/v1/settings/integrations/hubspot/sync/{lead_id}",
            headers=headers_b,
        )
        assert cross_tenant_sync.status_code == 404

        # 12. Approve the lead in Org A
        approve_res = await client.patch(
            f"/v1/leads/{lead_id}",
            headers=headers_a,
            json={"pipeline_state": "approved"},
        )
        assert approve_res.status_code == 200
        assert approve_res.json()["pipeline_state"] == "approved"

        # 13. Sync approved lead to HubSpot
        sync_success_res = await client.post(
            f"/v1/settings/integrations/hubspot/sync/{lead_id}",
            headers=headers_a,
        )
        assert sync_success_res.status_code == 200
        sync_data = sync_success_res.json()
        assert sync_data["pipeline_state"] == "synced"
        assert sync_data["sync_status"] == "synced"
        assert sync_data["remote_company_id"] is not None

        # Verify lead state changed in database
        lead_detail = await client.get(f"/v1/leads/{lead_id}", headers=headers_a)
        assert lead_detail.status_code == 200
        assert lead_detail.json()["pipeline_state"] == "synced"

        # 14. Disconnect HubSpot integration for Org A
        disc_res = await client.post("/v1/settings/integrations/hubspot/disconnect", headers=headers_a)
        assert disc_res.status_code == 200
        assert disc_res.json()["success"] is True

        # Verify status is now disconnected
        status_res3 = await client.get("/v1/settings/integrations/hubspot/status", headers=headers_a)
        assert status_res3.status_code == 200
        assert status_res3.json()["connected"] is False
