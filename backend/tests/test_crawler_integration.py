import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_crawl_lead_mock_mode_lifecycle():
    """Verify crawler execution in mock mode, evidence generation, and pipeline state progression."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post("/v1/auth/register", json={
            "email": f"crawler_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Crawler Tester",
            "org_name": "Audit Agency",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Ingest a lead
        csv = "company_name,domain\nModern Tech,moderntech.example.com\n"
        upload = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("lead.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
            headers=headers,
        )
        assert upload.status_code == 201

        # Get lead ID
        leads = (await client.get("/v1/leads", headers=headers)).json()["items"]
        lead_id = leads[0]["id"]
        assert leads[0]["pipeline_state"] == "new"

        # Trigger safe crawl (explicit mock mode)
        crawl_res = await client.post(f"/v1/leads/{lead_id}/crawl?mode=mock", headers=headers)
        assert crawl_res.status_code == 200
        crawl_data = crawl_res.json()

        assert crawl_data["lead_id"] == lead_id
        assert crawl_data["pipeline_state"] == "review"
        assert crawl_data["enrichment"]["status"] == "success"
        assert crawl_data["enrichment"]["provider"] == "mock_crawler"
        evidence = crawl_data["enrichment"]["evidence"]
        assert evidence["ssl_valid"] is True
        assert evidence["status_code"] == 200
        assert "Next.js" in evidence["detected_tech"]
        assert len(evidence["ctas_found"]) > 0

        # Query lead detail -> must contain latest enrichment
        detail_res = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["pipeline_state"] == "review"
        assert detail["latest_enrichment"] is not None
        assert detail["latest_enrichment"]["crawled_url"] == "https://moderntech.example.com"


@pytest.mark.asyncio
async def test_crawl_lead_ssrf_blocking_live_mode():
    """Verify SSRF defense stops requests to loopback or private ranges and marks enrichment failed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post("/v1/auth/register", json={
            "email": f"ssrf_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "SSRF Security Tester",
            "org_name": "Defense Corp",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Ingest a lead pointing to loopback (127.0.0.1)
        csv = "company_name,domain\nLocalhost Attacker,127.0.0.1\n"
        upload = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("ssrf.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
            headers=headers,
        )
        assert upload.status_code == 201

        lead_id = (await client.get("/v1/leads", headers=headers)).json()["items"][0]["id"]

        # Attempt crawl in live mode against 127.0.0.1
        crawl_res = await client.post(f"/v1/leads/{lead_id}/crawl?mode=live", headers=headers)
        assert crawl_res.status_code == 200
        crawl_data = crawl_res.json()

        # SSRF must intercept and mark enrichment as failed
        assert crawl_data["pipeline_state"] == "failed"
        assert crawl_data["enrichment"]["status"] == "failed"
        assert "SSRF" in crawl_data["enrichment"]["evidence"]["error"]


@pytest.mark.asyncio
async def test_crawl_lead_disabled_provider_mode():
    """Verify disabled provider mode gracefully rejects crawl."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post("/v1/auth/register", json={
            "email": f"disabled_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Disabled Provider Tester",
            "org_name": "Disabled Corp",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        csv = "company_name,domain\nAcme Corp,acme.example.com\n"
        await client.post(
            "/v1/ingestion/csv",
            files={"file": ("acme.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
            headers=headers,
        )
        lead_id = (await client.get("/v1/leads", headers=headers)).json()["items"][0]["id"]

        # Call crawl with forced disabled mode
        crawl_res = await client.post(f"/v1/leads/{lead_id}/crawl?mode=disabled", headers=headers)
        assert crawl_res.status_code == 200
        assert crawl_res.json()["enrichment"]["provider"] == "disabled"
        assert crawl_res.json()["enrichment"]["status"] == "failed"
