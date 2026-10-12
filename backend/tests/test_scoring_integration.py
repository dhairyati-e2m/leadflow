import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_lead_scoring_and_qualification_lifecycle():
    """Verify crawling a lead, evaluating all 22 deterministic signals, and saving explainable audit trail."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register organization and user
        reg = await client.post("/v1/auth/register", json={
            "email": f"scoring_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Scoring Lead",
            "org_name": "Scoring Corp",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload a sample lead
        csv = "company_name,domain\nPrecision Manufacturing,precisionmfg.example.com\n"
        upload = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("lead.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
            headers=headers,
        )
        assert upload.status_code == 201

        lead_id = (await client.get("/v1/leads", headers=headers)).json()["items"][0]["id"]

        # 3. Safe crawl lead in mock mode
        crawl_res = await client.post(f"/v1/leads/{lead_id}/crawl?mode=mock", headers=headers)
        assert crawl_res.status_code == 200

        # 4. Trigger 22-signal scoring evaluation
        score_res = await client.post(f"/v1/leads/{lead_id}/score", headers=headers)
        assert score_res.status_code == 200
        score_data = score_res.json()

        assert "final_score" in score_data
        assert 0.0 <= score_data["final_score"] <= 100.0
        assert score_data["qualification_band"] in ("qualified", "review", "disqualified")
        assert score_data["website_group_score"] >= 0.0
        assert score_data["marketing_group_score"] >= 0.0

        # Verify audit breakdown
        breakdown = score_data["signal_breakdown"]
        assert "signals" in breakdown
        assert len(breakdown["signals"]) == 22
        assert "explanations" in breakdown
        assert len(breakdown["explanations"]) == 22

        # 5. Query lead details to confirm updated pipeline state and latest score snapshot
        detail_res = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["latest_score"] == score_data["final_score"]
        assert detail["score_band"] == score_data["qualification_band"]
        assert detail["pipeline_state"] in ("qualified", "review", "rejected")
        assert detail["latest_score_record"] is not None
        assert detail["latest_score_record"]["id"] == score_data["id"]

        # 6. Query score history
        history_res = await client.get(f"/v1/leads/{lead_id}/scores", headers=headers)
        assert history_res.status_code == 200
        history = history_res.json()
        assert len(history) == 1
        assert history[0]["id"] == score_data["id"]


@pytest.mark.asyncio
async def test_tenant_icp_configuration_update_and_rbac():
    """Verify retrieving and customizing tenant ICP scoring weights and thresholds."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register owner
        reg_owner = await client.post("/v1/auth/register", json={
            "email": f"icp_owner_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "ICP Owner",
            "org_name": "Custom ICP Agency",
        })
        owner_token = reg_owner.json()["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        # 1. Fetch default configuration
        config_res = await client.get("/v1/scoring/config", headers=owner_headers)
        assert config_res.status_code == 200
        cfg = config_res.json()
        assert cfg["version"] == "1.0.0"
        assert cfg["qualified_threshold"] == 65.0
        assert "signal_weights" in cfg
        assert cfg["signal_weights"]["slow_site"] == 1.2

        # 2. Update configuration as owner (customize thresholds & weights)
        cfg["qualified_threshold"] = 75.0
        cfg["signal_weights"]["slow_site"] = 1.8
        cfg["ideal_client_bonus_points"] = 15.0

        put_res = await client.put("/v1/scoring/config", json=cfg, headers=owner_headers)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["qualified_threshold"] == 75.0
        assert updated["signal_weights"]["slow_site"] == 1.8
        assert updated["ideal_client_bonus_points"] == 15.0

        # Verify persistence on re-fetch
        refetch = await client.get("/v1/scoring/config", headers=owner_headers)
        assert refetch.status_code == 200
        assert refetch.json()["qualified_threshold"] == 75.0

        # 3. Add an Analyst member and verify RBAC protection on PUT /v1/scoring/config
        analyst_email = f"analyst_{uuid.uuid4().hex[:8]}@example.com"
        reg_analyst = await client.post("/v1/auth/register", json={
            "email": analyst_email,
            "password": "Password123!",
            "full_name": "Analyst User",
            "org_name": "Analyst Org",
        })
        # Add to custom ICP agency
        await client.post("/v1/orgs/members", json={
            "email": analyst_email,
            "role": "analyst",
        }, headers=owner_headers)

        # Analyst logs in and switches to Custom ICP Agency
        login_analyst = await client.post("/v1/auth/login", json={
            "email": analyst_email,
            "password": "Password123!",
        })
        analyst_token1 = login_analyst.json()["access_token"]
        target_org_id = reg_owner.json()["org_id"]
        switch_res = await client.post(
            f"/v1/orgs/{target_org_id}/switch",
            headers={"Authorization": f"Bearer {analyst_token1}"},
        )
        analyst_agency_token = switch_res.json()["access_token"]
        analyst_headers = {"Authorization": f"Bearer {analyst_agency_token}"}

        # Analyst attempts to update config -> Must get 403 Forbidden
        forbidden = await client.put("/v1/scoring/config", json=cfg, headers=analyst_headers)
        assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_cross_tenant_scoring_isolation():
    """Verify Organization Alpha cannot score or access scores belonging to Organization Beta."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Org Alpha
        reg_a = await client.post("/v1/auth/register", json={
            "email": f"org_a_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Alpha Lead",
            "org_name": "Org Alpha",
        })
        headers_a = {"Authorization": f"Bearer {reg_a.json()['access_token']}"}

        # Org Beta
        reg_b = await client.post("/v1/auth/register", json={
            "email": f"org_b_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Beta Lead",
            "org_name": "Org Beta",
        })
        headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

        # Org Beta creates and scores a lead
        csv_b = "company_name,domain\nBeta Systems,betasystems.example.com\n"
        await client.post(
            "/v1/ingestion/csv",
            files={"file": ("b.csv", io.BytesIO(csv_b.encode("utf-8")), "text/csv")},
            headers=headers_b,
        )
        lead_b_id = (await client.get("/v1/leads", headers=headers_b)).json()["items"][0]["id"]
        await client.post(f"/v1/leads/{lead_b_id}/crawl?mode=mock", headers=headers_b)
        await client.post(f"/v1/leads/{lead_b_id}/score", headers=headers_b)

        # Org Alpha attempts to score Lead B -> 404 (Lead not found due to RLS)
        cross_score = await client.post(f"/v1/leads/{lead_b_id}/score", headers=headers_a)
        assert cross_score.status_code == 404

        # Org Alpha attempts to list Lead B scores -> 404 or empty (RLS isolation)
        cross_scores = await client.get(f"/v1/leads/{lead_b_id}/scores", headers=headers_a)
        assert cross_scores.status_code in (200, 404)
        if cross_scores.status_code == 200:
            assert len(cross_scores.json()) == 0
