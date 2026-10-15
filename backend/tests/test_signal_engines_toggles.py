import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_signal_engines_integration_toggles_enforced():
    """
    Verifies Requirement 8:
    Toggling an integration or master switch ON/OFF in Signal Engines actually works in the backend.
    """
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Register organization and admin user
        reg_res = await client.post(
            "/v1/auth/register",
            json={
                "email": f"engine_admin_{suffix}@leadtest.com",
                "password": "Password123!",
                "full_name": "Engine Admin",
                "org_name": f"Engine Org {suffix}",
            },
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Verify Hunter works initially
        disc_res1 = await client.post(
            "/v1/audiences/discover",
            headers=headers,
            json={"limit": 2},
        )
        assert disc_res1.status_code == 200

        # 3. Disable Hunter in Signal Engines settings
        toggle_off_res = await client.put(
            "/v1/settings/integrations",
            headers=headers,
            json={"provider_toggles": {"hunter": False}},
        )
        assert toggle_off_res.status_code == 200
        hunter_item = next(p for p in toggle_off_res.json()["providers"] if p["key"] == "hunter")
        assert hunter_item["enabled"] is False

        # 4. Verify Hunter is now blocked in backend
        disc_res2 = await client.post(
            "/v1/audiences/discover",
            headers=headers,
            json={"limit": 2},
        )
        assert disc_res2.status_code == 400
        assert "disabled" in disc_res2.json()["detail"].lower()

        # 5. Enable Hunter back
        toggle_on_res = await client.put(
            "/v1/settings/integrations",
            headers=headers,
            json={"provider_toggles": {"hunter": True}},
        )
        assert toggle_on_res.status_code == 200

        disc_res3 = await client.post(
            "/v1/audiences/discover",
            headers=headers,
            json={"limit": 2},
        )
        assert disc_res3.status_code == 200

        # 6. Turn Master Switch OFF
        master_off_res = await client.put(
            "/v1/settings/integrations",
            headers=headers,
            json={"master_switch_enabled": False},
        )
        assert master_off_res.status_code == 200
        assert master_off_res.json()["master_switch_enabled"] is False

        # 7. Verify all external calls are blocked when Master Switch is OFF
        disc_res4 = await client.post(
            "/v1/audiences/discover",
            headers=headers,
            json={"limit": 2},
        )
        assert disc_res4.status_code == 400
        assert "disabled" in disc_res4.json()["detail"].lower()
