import uuid
from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.config import settings
from backend.app.main import app


@pytest.mark.asyncio
async def test_icp_discovery_pipeline_end_to_end():
    """
    Tests the complete user journey:
    1. Filter & discover companies with limit constraint (Hunter Discover).
    2. Choose a company and move it to Lead Pipeline (Review state).
    3. Calculate 22-signal score for the review lead.
    4. Approve and send customized outreach email via Resend API.
    """
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Register organization and admin user
        reg_res = await client.post(
            "/v1/auth/register",
            json={
                "email": f"admin_{suffix}@leadtest.com",
                "password": "Password123!",
                "full_name": "Pipeline Admin",
                "org_name": f"Discovery Corp {suffix}",
            },
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Discover companies matching ICP with constraint limit=3
        disc_res = await client.post(
            "/v1/audiences/discover",
            headers=headers,
            json={
                "filters": {
                    "verticals": ["Healthcare & Medical Devices"],
                    "locations": ["Toronto, Canada"],
                    "headcount_ranges": ["11-50 employees"],
                },
                "limit": 3,
            },
        )
        assert disc_res.status_code == 200
        disc_data = disc_res.json()
        assert disc_data["limit_requested"] == 3
        assert len(disc_data["companies"]) <= 3
        assert len(disc_data["companies"]) > 0

        target_company = disc_data["companies"][0]
        assert "domain" in target_company
        assert "company_name" in target_company

        # 3. Move target company to Review in Lead Pipeline
        move_res = await client.post(
            "/v1/audiences/move-to-pipeline",
            headers=headers,
            json={
                "company_name": target_company["company_name"],
                "domain": target_company["domain"],
                "industry": target_company["industry"],
                "location": target_company["location"],
                "employee_count": target_company["employee_count"],
                "contact_email": target_company.get("sample_email") or f"contact@{target_company['domain']}",
                "contact_name": "Executive Director",
                "pipeline_state": "review",
            },
        )
        assert move_res.status_code == 201
        move_data = move_res.json()
        assert move_data["pipeline_state"] == "review"
        assert move_data["domain"] == target_company["domain"]
        lead_id = move_data["lead_id"]

        # 4. View in Lead Pipeline details
        lead_res = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert lead_res.status_code == 200
        lead_data = lead_res.json()
        assert lead_data["pipeline_state"] == "review"

        # 5. Calculate 22-signal score on clicking "Score"
        score_res = await client.post(f"/v1/leads/{lead_id}/score", headers=headers)
        assert score_res.status_code == 200
        score_data = score_res.json()
        assert "final_score" in score_data
        assert "signal_breakdown" in score_data
        assert 0.0 <= score_data["final_score"] <= 100.0

        # 6. Verify lead has score
        lead_scored = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert lead_scored.json()["latest_score"] == score_data["final_score"]

        # 7. Approve & Dispatch email via Resend with customized draft window content
        with patch.object(settings, "PROVIDER_RESEND_MODE", "mock"):
            send_res = await client.post(
                f"/v1/leads/{lead_id}/send-outreach",
                headers=headers,
                json={
                    "to_email": move_data["contact_email"] or "contact@example.com",
                    "subject": f"Partnership inquiry regarding {target_company['company_name']}",
                    "body": f"Hello Team,\n\nWe reviewed {target_company['company_name']} and would love to connect regarding digital optimization.\n\nBest,\nLeadFlow Strategy Team",
                },
            )
            assert send_res.status_code == 200
            send_data = send_res.json()
            assert send_data["delivered"] is True
            assert send_data["pipeline_state"] == "approved"
            assert send_data["provider"] == "resend"

        # 8. Verify lead pipeline state updated to approved
        final_lead = await client.get(f"/v1/leads/{lead_id}", headers=headers)
        assert final_lead.json()["pipeline_state"] == "approved"
