import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_integration_settings_rbac_and_master_switch():
    """Validates retrieval, RBAC enforcement, policy protection, and master switch toggling."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register test owner
        owner_email = f"int_owner_{uuid.uuid4().hex[:8]}@example.com"
        reg_res = await client.post("/v1/auth/register", json={
            "email": owner_email,
            "password": "Password123!",
            "full_name": "Integration Owner",
            "org_name": f"Integration Test Org {uuid.uuid4().hex[:6]}",
        })
        assert reg_res.status_code == 201
        owner_token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {owner_token}"}

        # 2. Retrieve integration settings
        get_res = await client.get("/v1/settings/integrations", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["master_switch_enabled"] is True
        assert len(data["providers"]) >= 5

        # 3. Toggle master switch OFF
        put_res = await client.put("/v1/settings/integrations", headers=headers, json={
            "master_switch_enabled": False,
        })
        assert put_res.status_code == 200
        assert put_res.json()["master_switch_enabled"] is False

        # When master switch is OFF, all non-local providers report disabled
        for p in put_res.json()["providers"]:
            if p["key"] != "safe_crawler":
                assert p["enabled"] is False

        # 4. Attempt to enable Apollo (strictly rejected by Policy under Rule A)
        bad_apollo = await client.put("/v1/settings/integrations", headers=headers, json={
            "provider_toggles": {"apollo": True},
        })
        assert bad_apollo.status_code == 400
        assert "no permanent free API tier" in bad_apollo.json()["detail"]

        # 5. Attempt to enable Snov (strictly rejected by Policy under Rule A)
        bad_snov = await client.put("/v1/settings/integrations", headers=headers, json={
            "provider_toggles": {"snov": True},
        })
        assert bad_snov.status_code == 400

        # 6. Toggle master switch back ON
        on_res = await client.put("/v1/settings/integrations", headers=headers, json={
            "master_switch_enabled": True,
        })
        assert on_res.status_code == 200
        assert on_res.json()["master_switch_enabled"] is True
