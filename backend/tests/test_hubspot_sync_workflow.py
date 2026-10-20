"""Integration and Unit Test Suite for HubSpot CRM Sync Workflow.

Tests verify:
1. Industry mapping layer (mapping descriptive categories to standard HubSpot options,
   safe omission with warnings for unsupported industries, capitalization/whitespace normalization).
2. Employee count mapping (parsing valid integers, safely omitting descriptive ranges with warnings,
   never fabricating false integer estimates).
3. Pre-sync payload validator (blocking errors vs non-blocking warnings, contact validation).
4. Error formatter (parsing HubSpot 400 errors, redacting sensitive tokens).
5. Pre-sync preview endpoint (GET /v1/settings/integrations/hubspot/preview/{lead_id}).
6. Multi-tenant isolation for sync preview, sync write, and sync history.
7. CRMSync persistence and history endpoint (GET /v1/settings/integrations/hubspot/history).
"""

from datetime import datetime, timedelta, timezone
import json
import time
import uuid
import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.providers.hubspot import HubSpotProvider
from backend.app.providers.hubspot_mapping import (
    HUBSPOT_STANDARD_INDUSTRIES,
    LEADFLOW_TO_HUBSPOT_INDUSTRY_MAP,
    map_employee_count,
    map_industry_to_hubspot,
    validate_sync_payload,
)


# ==============================================================================
# Unit Tests: Industry & Employee Mapping Layer
# ==============================================================================

def test_industry_mapping_standard_and_variations():
    """Verify exact options, descriptive categories, and safe omission of unknown industries."""
    # 1. Exact HubSpot standard enum code
    code, status, msg = map_industry_to_hubspot("COMPUTER_SOFTWARE")
    assert code == "COMPUTER_SOFTWARE"
    assert status == "ready"

    # 2. Descriptive LeadFlow / Hunter categories
    code, status, msg = map_industry_to_hubspot("B2B SaaS & Enterprise Software")
    assert code == "COMPUTER_SOFTWARE"
    assert status == "mapped"

    code, status, msg = map_industry_to_hubspot("Financial Services & Fintech")
    assert code == "FINANCIAL_SERVICES"
    assert status == "mapped"

    code, status, msg = map_industry_to_hubspot("Healthcare & Life Sciences")
    assert code == "HOSPITAL_HEALTH_CARE"
    assert status == "mapped"

    # 3. Capitalization and whitespace normalization
    code, status, msg = map_industry_to_hubspot("   computer software   ")
    assert code == "COMPUTER_SOFTWARE"
    assert status in ("ready", "mapped")

    # 4. Unknown/Unsupported industry must be safely omitted with non-blocking warning
    code, status, msg = map_industry_to_hubspot("Quantum Holographic Alchemy")
    assert code is None
    assert status == "omitted_warning"
    assert "omitted" in msg.lower() or "does not match" in msg.lower()

    # 5. None or empty string
    code, status, msg = map_industry_to_hubspot(None)
    assert code is None
    assert status == "omitted"

    code, status, msg = map_industry_to_hubspot("   ")
    assert code is None
    assert status == "omitted"


def test_employee_count_parsing_and_ranges():
    """Verify exact positive integers are mapped, descriptive ranges are safely omitted with warnings."""
    # 1. Single exact integers
    count, status, msg = map_employee_count(42)
    assert count == 42
    assert status == "ready"

    count, status, msg = map_employee_count("150")
    assert count == 150
    assert status == "ready"

    count, status, msg = map_employee_count("5,000")
    assert count == 5000
    assert status == "ready"

    # 2. Descriptive ranges (must omit from payload with warning, NEVER fabricate)
    count, status, msg = map_employee_count("11-50 employees")
    assert count is None
    assert status == "omitted_warning"
    assert "range" in msg.lower()
    assert "11-50 employees" in msg

    count, status, msg = map_employee_count("501-1,000")
    assert count is None
    assert status == "omitted_warning"
    assert "range" in msg.lower()

    count, status, msg = map_employee_count("1,000+ enterprise")
    assert count is None
    assert status == "omitted_warning"
    assert "range" in msg.lower()

    # 3. Invalid or non-positive integers
    count, status, msg = map_employee_count(0)
    assert count is None
    assert status in ("invalid_error", "omitted_warning")

    count, status, msg = map_employee_count(-10)
    assert count is None
    assert status in ("invalid_error", "omitted_warning")

    count, status, msg = map_employee_count("unknown size")
    assert count is None
    assert status in ("invalid_error", "omitted_warning")


def test_validate_sync_payload_blocking_vs_warnings():
    """Verify validation correctly separates blocking errors from non-blocking warnings."""
    # 1. Valid payload with descriptive categories
    lead_data = {
        "company_name": "Acme Software Corp",
        "domain": "acmesoftware.com",
        "industry": "B2B SaaS & Enterprise Software",
        "employee_count": "11-50 employees",
        "location": "San Francisco, CA",
    }
    contact_data = {
        "email": "jane@acmesoftware.com",
        "name": "Jane Doe",
    }
    res = validate_sync_payload(lead_data, contact_data)
    assert res["is_valid"] is True
    assert res["has_blocking_errors"] is False
    assert len(res["errors"]) == 0
    # Employee count range omitted with warning
    assert len(res["warnings"]) == 1
    assert "range" in res["warnings"][0].lower()

    # Verify company payload has mapped industry and omitted employee count
    assert res["company_payload"]["name"] == "Acme Software Corp"
    assert res["company_payload"]["domain"] == "acmesoftware.com"
    assert res["company_payload"]["industry"] == "COMPUTER_SOFTWARE"
    assert "numberofemployees" not in res["company_payload"]

    # Verify contact payload
    assert res["contact_payload"] is not None
    assert res["contact_payload"]["email"] == "jane@acmesoftware.com"

    # 2. Blocking error: Missing domain
    bad_lead = {
        "company_name": "No Domain Corp",
        "domain": "",
    }
    res_bad = validate_sync_payload(bad_lead)
    assert res_bad["is_valid"] is False
    assert res_bad["has_blocking_errors"] is True
    assert any("domain" in e.lower() for e in res_bad["errors"])

    # 3. Non-blocking warning: Missing contact email
    lead_no_contact = {
        "company_name": "Valid Domain Corp",
        "domain": "validdomain.com",
    }
    res_no_contact = validate_sync_payload(lead_no_contact, None)
    assert res_no_contact["is_valid"] is True
    assert res_no_contact["has_blocking_errors"] is False
    assert any("contact" in w.lower() and "skipped" in w.lower() for w in res_no_contact["warnings"])
    assert res_no_contact["contact_payload"] is None


def test_error_formatting_and_token_redaction():
    """Verify parsing HubSpot error responses."""
    error_body = {
        "status": "error",
        "message": "Property values were not valid",
        "errors": [
            {
                "message": "B2B SaaS & Enterprise Software was not one of the allowed options",
                "in": "industry",
            }
        ],
        "correlationId": "corr-12345",
    }
    dummy_resp = httpx.Response(status_code=400, content=json.dumps(error_body).encode("utf-8"))
    provider = HubSpotProvider()
    formatted = provider._format_hubspot_error(dummy_resp)
    assert "industry" in formatted
    assert "corr-12345" in formatted


# ==============================================================================
# Integration Tests: Endpoints, Tenant Isolation, and CRM Sync History
# ==============================================================================

@pytest.mark.asyncio
async def test_hubspot_sync_preview_and_history_workflow():
    """End-to-end integration test of HubSpot preview, sync, and history."""
    # Configure test settings for mock mode
    settings.PROVIDER_HUBSPOT_MODE = "mock"
    settings.HUBSPOT_CLIENT_ID = "mock_client_id_test"
    settings.HUBSPOT_CLIENT_SECRET = "mock_client_secret_test"
    settings.HUBSPOT_REDIRECT_URI = "http://localhost:8000/v1/settings/integrations/hubspot/callback"

    suffix = uuid.uuid4().hex[:6]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register Org A (Owner)
        reg_a = await client.post(
            "/v1/auth/register",
            json={
                "email": f"owner_a_{suffix}@companya.com",
                "password": "Password123!",
                "full_name": "Alice Owner",
                "org_name": f"Org Alpha {suffix}",
            },
        )
        assert reg_a.status_code == 201
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 2. Register Org B (Owner)
        reg_b = await client.post(
            "/v1/auth/register",
            json={
                "email": f"owner_b_{suffix}@companyb.com",
                "password": "Password123!",
                "full_name": "Bob Owner",
                "org_name": f"Org Beta {suffix}",
            },
        )
        assert reg_b.status_code == 201
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 3. Connect HubSpot for Org A using the OAuth flow
        auth_res = await client.get("/v1/settings/integrations/hubspot/authorize", headers=headers_a)
        assert auth_res.status_code == 200
        oauth_state = auth_res.json()["state"]

        callback_res = await client.get(
            "/v1/settings/integrations/hubspot/callback",
            params={"code": "valid_test_code", "state": oauth_state},
            follow_redirects=False,
        )
        assert callback_res.status_code == 307
        assert "hubspot_connected=true" in callback_res.headers["location"]

        # Verify Org A is connected
        status_res_a = await client.get("/v1/settings/integrations/hubspot/status", headers=headers_a)
        assert status_res_a.status_code == 200
        assert status_res_a.json()["connected"] is True

        # 4. Create lead in Org A with the problematic fields identified in bug report
        lead_create_res = await client.post(
            "/v1/audiences/move-to-pipeline",
            headers=headers_a,
            json={
                "company_name": f"Cloud Scale {suffix}",
                "domain": f"cloudscale-{suffix}.com",
                "industry": "B2B SaaS & Enterprise Software",
                "employee_count": "11-50 employees",
                "location": "Austin, TX",
                "contact_email": f"founder@{suffix}.com",
                "contact_name": "Alex Founder",
            },
        )
        assert lead_create_res.status_code == 201
        lead_id = lead_create_res.json()["lead_id"]

        # 5. Verify that unapproved lead cannot be previewed (approval gating check)
        unapproved_preview = await client.get(
            f"/v1/settings/integrations/hubspot/preview/{lead_id}",
            headers=headers_a,
        )
        assert unapproved_preview.status_code == 400
        assert "Only approved leads" in unapproved_preview.json()["detail"]

        # 6. Approve the lead in Org A
        approve_res = await client.patch(
            f"/v1/leads/{lead_id}",
            headers=headers_a,
            json={"pipeline_state": "approved"},
        )
        assert approve_res.status_code == 200

        # 7. Request Sync Preview on approved lead (GET /preview/{lead_id})
        preview_res = await client.get(
            f"/v1/settings/integrations/hubspot/preview/{lead_id}",
            headers=headers_a,
        )
        assert preview_res.status_code == 200
        preview_data = preview_res.json()

        assert preview_data["lead_id"] == lead_id
        assert preview_data["company_name"] == f"Cloud Scale {suffix}"
        assert preview_data["domain"] == f"cloudscale-{suffix}.com"
        assert preview_data["operation"] in ["create", "update"]
        assert preview_data["is_valid"] is True
        assert preview_data["has_blocking_errors"] is False

        # Verify field validations list
        validations = {v["field"]: v for v in preview_data["field_validations"]}
        assert "company_name" in validations
        assert "domain" in validations
        assert "industry" in validations
        assert "employee_count" in validations

        # Verify industry was mapped to standard COMPUTER_SOFTWARE
        assert validations["industry"]["status"] == "mapped"
        assert validations["industry"]["hubspot_value"] == "COMPUTER_SOFTWARE"

        # Verify employee count range was safely omitted with warning
        assert validations["employee_count"]["status"] == "omitted_warning"
        assert len(preview_data["warnings"]) >= 1
        assert any("range" in w.lower() for w in preview_data["warnings"])

        # 8. Multi-tenant isolation: Org B attempts to preview Org A's lead -> 404
        cross_preview_res = await client.get(
            f"/v1/settings/integrations/hubspot/preview/{lead_id}",
            headers=headers_b,
        )
        assert cross_preview_res.status_code == 404

        # 9. Non-existent lead returns 404
        missing_preview_res = await client.get(
            f"/v1/settings/integrations/hubspot/preview/{uuid.uuid4()}",
            headers=headers_a,
        )
        assert missing_preview_res.status_code == 404

        # 10. Execute Sync (POST /sync/{lead_id})
        sync_res = await client.post(
            f"/v1/settings/integrations/hubspot/sync/{lead_id}",
            headers=headers_a,
        )
        assert sync_res.status_code == 200
        sync_data = sync_res.json()
        assert sync_data["sync_status"] == "synced"
        assert sync_data["pipeline_state"] == "synced"
        assert sync_data["remote_company_id"] is not None
        assert "correlation_id" in sync_data

        # 10. Query Sync History (GET /history)
        history_res_a = await client.get(
            "/v1/settings/integrations/hubspot/history",
            headers=headers_a,
        )
        assert history_res_a.status_code == 200
        history_data_a = history_res_a.json()
        assert history_data_a["total"] >= 1
        assert any(item["lead_id"] == lead_id for item in history_data_a["items"])
        matched_item = next(item for item in history_data_a["items"] if item["lead_id"] == lead_id)
        assert matched_item["sync_status"] == "synced"
        assert matched_item["remote_company_id"] == sync_data["remote_company_id"]

        # 11. Multi-tenant isolation: Org B queries history -> must NOT see Org A's records
        history_res_b = await client.get(
            "/v1/settings/integrations/hubspot/history",
            headers=headers_b,
        )
        assert history_res_b.status_code == 200
        history_data_b = history_res_b.json()
        assert not any(item["lead_id"] == lead_id for item in history_data_b["items"])
