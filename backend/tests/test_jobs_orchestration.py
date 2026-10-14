import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.app.workers.arq_pool import get_arq_redis_pool


@pytest.mark.asyncio
async def test_batch_run_execution_checkpointing_and_usage():
    """Verify triggering a batch run, pipeline execution (crawl -> score), checkpointing, and usage recording."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register organization and user
        reg = await client.post("/v1/auth/register", json={
            "email": f"orchestrator_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Pipeline Orchestrator",
            "org_name": f"Orchestrator Corp {uuid.uuid4().hex[:6]}",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Ingest 3 leads via CSV
        csv_content = (
            "company_name,domain,industry\n"
            "Orchestrated Tech 1,orch1.example.com,Technology\n"
            "Orchestrated Tech 2,orch2.example.com,Finance\n"
            "Orchestrated Tech 3,orch3.example.com,Healthcare\n"
        )
        upload_res = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("batch.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
            headers=headers,
        )
        assert upload_res.status_code == 201
        search_id = upload_res.json()["search_id"]

        # 3. Trigger batch execution run with sync_execution=True (and forced mock mode for fast deterministic testing)
        run_res = await client.post(
            "/v1/jobs/runs",
            json={
                "run_type": "enrich_and_score",
                "search_id": search_id,
                "forced_crawl_mode": "mock",
                "sync_execution": True,
            },
            headers=headers,
        )
        assert run_res.status_code == 201
        run_data = run_res.json()
        assert run_data["status"] == "completed"
        assert run_data["total_items"] == 3
        assert run_data["processed_items"] == 3
        assert run_data["failed_items"] == 0
        assert run_data["progress_percentage"] == 100.0

        run_id = run_data["id"]

        # 4. Query run status by ID
        status_res = await client.get(f"/v1/jobs/runs/{run_id}", headers=headers)
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["id"] == run_id
        assert status_data["status"] == "completed"
        assert status_data["checkpoint_data"]["completed_percentage"] == 100.0

        # 5. List all runs for tenant
        list_runs_res = await client.get("/v1/jobs/runs", headers=headers)
        assert list_runs_res.status_code == 200
        runs_list = list_runs_res.json()
        assert len(runs_list) >= 1
        assert any(r["id"] == run_id for r in runs_list)

        # 6. Verify leads are now qualified/scored
        leads_res = await client.get("/v1/leads", headers=headers)
        items = leads_res.json()["items"]
        for lead in items:
            assert lead["pipeline_state"] in ("qualified", "review", "rejected")
            assert lead["latest_score"] is not None

        # 7. Verify usage ledger metrics
        usage_res = await client.get("/v1/jobs/usage", headers=headers)
        assert usage_res.status_code == 200
        usage_data = usage_res.json()
        metrics = usage_data["metrics"]
        assert metrics.get("pages_crawled", 0) >= 3
        assert metrics.get("leads_scored", 0) >= 3


@pytest.mark.asyncio
async def test_arq_redis_enqueue_and_cancellation():
    """Verify live Redis ARQ queue interaction and run cancellation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post("/v1/auth/register", json={
            "email": f"cancel_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Cancel Tester",
            "org_name": f"Cancel Corp {uuid.uuid4().hex[:6]}",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Ingest a lead
        csv_content = "company_name,domain\nQuick Tech,quicktech.example.com\n"
        await client.post(
            "/v1/ingestion/csv",
            files={"file": ("q.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
            headers=headers,
        )

        # Trigger run with sync_execution=False (enqueues to live Redis 7 container)
        run_res = await client.post(
            "/v1/jobs/runs",
            json={
                "run_type": "enrich_and_score",
                "forced_crawl_mode": "mock",
                "sync_execution": False,
            },
            headers=headers,
        )
        assert run_res.status_code == 201
        run_data = run_res.json()
        run_id = run_data["id"]
        assert run_data["status"] == "pending"

        # Verify Redis ARQ connection pool is active
        arq_pool = await get_arq_redis_pool()
        ping_res = await arq_pool.ping()
        assert ping_res is True

        # Cancel the pending run
        cancel_res = await client.post(f"/v1/jobs/runs/{run_id}/cancel", headers=headers)
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"

        # Second cancel attempt should return 400
        bad_cancel = await client.post(f"/v1/jobs/runs/{run_id}/cancel", headers=headers)
        assert bad_cancel.status_code == 400


@pytest.mark.asyncio
async def test_cross_tenant_jobs_isolation():
    """Verify Tenant Alpha cannot see, query, or cancel Tenant Beta background runs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Tenant A
        reg_a = await client.post("/v1/auth/register", json={
            "email": f"job_a_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Job Alpha",
            "org_name": f"Job Alpha Corp {uuid.uuid4().hex[:6]}",
        })
        headers_a = {"Authorization": f"Bearer {reg_a.json()['access_token']}"}

        # Tenant B
        reg_b = await client.post("/v1/auth/register", json={
            "email": f"job_b_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Job Beta",
            "org_name": f"Job Beta Corp {uuid.uuid4().hex[:6]}",
        })
        headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

        # Tenant B creates lead and run
        csv_b = "company_name,domain\nBeta Job,betajob.example.com\n"
        await client.post(
            "/v1/ingestion/csv",
            files={"file": ("b.csv", io.BytesIO(csv_b.encode("utf-8")), "text/csv")},
            headers=headers_b,
        )
        run_b = (await client.post(
            "/v1/jobs/runs",
            json={"run_type": "enrich_and_score", "sync_execution": True, "forced_crawl_mode": "mock"},
            headers=headers_b,
        )).json()
        run_b_id = run_b["id"]

        # Tenant A attempts to get status of Tenant B's run -> 404
        cross_get = await client.get(f"/v1/jobs/runs/{run_b_id}", headers=headers_a)
        assert cross_get.status_code == 404

        # Tenant A attempts to cancel Tenant B's run -> 404
        cross_cancel = await client.post(f"/v1/jobs/runs/{run_b_id}/cancel", headers=headers_a)
        assert cross_cancel.status_code == 404
