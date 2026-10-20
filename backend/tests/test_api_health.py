import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_health_liveness_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app"] == "LeadFlow"
        assert "providers" in data
        assert data["providers"]["enrichment"] in ("mock", "live", "disabled")
        assert data["providers"]["hubspot"] in ("mock", "live", "disabled")


@pytest.mark.asyncio
async def test_ready_readiness_endpoint_graceful_degraded():
    """When PostgreSQL/Redis are not connected, readiness returns degraded status without crashing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/v1/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("ready", "degraded")
        assert "dependencies" in data
        assert "postgres" in data["dependencies"]
        assert "redis" in data["dependencies"]


@pytest.mark.asyncio
async def test_scoring_catalog_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/v1/scoring/signals")
        assert response.status_code == 200
        data = response.json()
        assert data["total_signals"] == 22
        assert len(data["signals"]) == 22


@pytest.mark.asyncio
async def test_scoring_evaluate_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "url": "https://example.com",
            "html": "<html><head><title>Example Domain Title</title></head><body><h1>Example</h1><p>Meaningful content</p><button>Get Started</button></body></html>",
            "load_time_ms": 1100.0,
            "ssl_valid": True,
        }
        response = await client.post("/v1/scoring/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "final_score" in data
        assert 0.0 <= data["final_score"] <= 100.0
        assert data["qualification_band"] in ("disqualified", "review", "qualified")
        assert len(data["signals_evaluated"]) == 22
        assert len(data["explanations"]) == 22
