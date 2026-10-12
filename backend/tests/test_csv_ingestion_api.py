import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_csv_upload_valid_file_and_pagination():
    """Verify CSV upload, parsing, database storage, and paginated lead retrieval."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register organization and user
        unique_email = f"ingest_{uuid.uuid4().hex[:8]}@example.com"
        reg = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Ingestion Lead",
            "org_name": "Data Ingestion Corp",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Prepare sample CSV payload
        csv_content = (
            "company_name,domain,industry,location,employee_count\n"
            "Acme Tools,acmetools.example.com,Manufacturing,Boston,50-100\n"
            "CloudSphere Inc,https://www.cloudsphere.example.com/about,Technology,San Francisco,100-250\n"
            "Green Energy Ltd,greenenergy.example.com,Energy,Denver,20-50\n"
        )
        files = {"file": ("leads_sample.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}

        # 3. Post to CSV ingestion endpoint
        upload_res = await client.post("/v1/ingestion/csv", files=files, headers=headers)
        assert upload_res.status_code == 201
        data = upload_res.json()
        assert data["total_rows_parsed"] == 3
        assert data["imported_count"] == 3
        assert data["duplicate_count"] == 0
        assert data["search_id"]

        # 4. List leads with pagination
        list_res = await client.get("/v1/leads?page=1&page_size=10", headers=headers)
        assert list_res.status_code == 200
        leads_data = list_res.json()
        assert leads_data["total"] == 3
        assert len(leads_data["items"]) == 3
        domains = [item["domain"] for item in leads_data["items"]]
        assert "acmetools.example.com" in domains
        assert "cloudsphere.example.com" in domains  # Cleanly normalized!
        assert "greenenergy.example.com" in domains


@pytest.mark.asyncio
async def test_csv_formula_injection_defense():
    """Verify that dangerous spreadsheet formula prefixes (=, +, -, @) are sanitized upon upload."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post("/v1/auth/register", json={
            "email": f"formula_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Security Tester",
            "org_name": "Sanitization Corp",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # CSV with malicious spreadsheet formula injections
        malicious_csv = (
            "company_name,domain,industry\n"
            "=cmd|' /C calc'!A0,badcalc.example.com,Hacking\n"
            "+@SUM(1+1),plusformula.example.com,Finance\n"
            "-2+3*4,minusformula.example.com,Math\n"
        )
        files = {"file": ("exploit.csv", io.BytesIO(malicious_csv.encode("utf-8")), "text/csv")}

        res = await client.post("/v1/ingestion/csv", files=files, headers=headers)
        assert res.status_code == 201
        assert res.json()["imported_count"] == 3

        # Verify leads in database have dangerous formula characters neutralized
        leads_res = await client.get("/v1/leads", headers=headers)
        items = leads_res.json()["items"]
        company_names = [i["company_name"] for i in items]

        for name in company_names:
            assert name.startswith("'"), f"Formula injection vulnerability! Cell was not escaped: {name}"


@pytest.mark.asyncio
async def test_csv_deduplication_and_tenant_isolation():
    """
    Verify:
    1. Re-uploading duplicate domains in the same organization skips duplicates.
    2. The exact same domain uploaded to a DIFFERENT organization is allowed and isolated.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Tenant 1 setup
        reg1 = await client.post("/v1/auth/register", json={
            "email": f"t1_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Tenant One",
            "org_name": "Alpha Leads",
        })
        token1 = reg1.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # Tenant 2 setup
        reg2 = await client.post("/v1/auth/register", json={
            "email": f"t2_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Tenant Two",
            "org_name": "Beta Leads",
        })
        token2 = reg2.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        test_csv = (
            "company_name,domain\n"
            "Shared Domain Corp,shared-domain.example.com\n"
        )

        # 1. Tenant 1 uploads shared-domain.example.com
        res1 = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("test.csv", io.BytesIO(test_csv.encode("utf-8")), "text/csv")},
            headers=headers1,
        )
        assert res1.status_code == 201
        assert res1.json()["imported_count"] == 1
        assert res1.json()["duplicate_count"] == 0

        # 2. Tenant 1 uploads same CSV again -> duplicate detected and skipped
        res1_dup = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("test.csv", io.BytesIO(test_csv.encode("utf-8")), "text/csv")},
            headers=headers1,
        )
        assert res1_dup.status_code == 201
        assert res1_dup.json()["imported_count"] == 0
        assert res1_dup.json()["duplicate_count"] == 1

        # 3. Tenant 2 uploads same domain -> successfully imported into Tenant 2!
        res2 = await client.post(
            "/v1/ingestion/csv",
            files={"file": ("test.csv", io.BytesIO(test_csv.encode("utf-8")), "text/csv")},
            headers=headers2,
        )
        assert res2.status_code == 201
        assert res2.json()["imported_count"] == 1

        # 4. Verify Tenant 1 only sees 1 total lead
        t1_leads = (await client.get("/v1/leads", headers=headers1)).json()
        assert t1_leads["total"] == 1

        # 5. Verify Tenant 2 only sees 1 total lead
        t2_leads = (await client.get("/v1/leads", headers=headers2)).json()
        assert t2_leads["total"] == 1


@pytest.mark.asyncio
async def test_leads_search_filter_and_lifecycle():
    """Verify search filter, pipeline state updates, and deletion."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post("/v1/auth/register", json={
            "email": f"filter_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
            "full_name": "Filter Tester",
            "org_name": "Filter Corp",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        csv = (
            "company_name,domain,industry\n"
            "Alpha Medical,alphamedical.example.com,Healthcare\n"
            "Beta Logistics,betalogistics.example.com,Logistics\n"
            "Gamma Biotech,gammabiotech.example.com,Healthcare\n"
        )
        await client.post(
            "/v1/ingestion/csv",
            files={"file": ("data.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
            headers=headers,
        )

        # 1. Search by keyword
        search_res = await client.get("/v1/leads?search=medical", headers=headers)
        assert search_res.status_code == 200
        items = search_res.json()["items"]
        assert len(items) == 1
        assert items[0]["company_name"] == "Alpha Medical"

        lead_id = items[0]["id"]

        # 2. Update lead pipeline state
        patch_res = await client.patch(f"/v1/leads/{lead_id}", json={"pipeline_state": "review"}, headers=headers)
        assert patch_res.status_code == 200
        assert patch_res.json()["pipeline_state"] == "review"

        # 3. Filter by pipeline state
        state_res = await client.get("/v1/leads?state=review", headers=headers)
        assert state_res.status_code == 200
        assert len(state_res.json()["items"]) == 1

        # 4. Delete lead
        del_res = await client.delete(f"/v1/leads/{lead_id}", headers=headers)
        assert del_res.status_code == 204

        # Verify lead is gone
        verify_del = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert verify_del.status_code == 404
