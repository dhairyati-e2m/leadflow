import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.brave import BraveSearchProvider
from backend.app.providers.gemini import GoogleGeminiProvider
from backend.app.providers.serpapi import SerpApiProvider
from backend.app.providers.hunter import HunterProvider
from backend.app.providers.resend import ResendProvider


# ------------------------------------------------------------------------------
# QuotaManager Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_quota_manager_kill_switch():
    with patch.object(settings, "GLOBAL_EXTERNAL_API_KILL_SWITCH", True):
        allowed, reason, summary = await QuotaManager.check_and_reserve("brave", count=1)
        assert allowed is False
        assert "kill switch" in reason.lower()


@pytest.mark.asyncio
async def test_quota_manager_circuit_breaker():
    unique_prov = f"test_cb_{uuid.uuid4().hex[:8]}"
    with patch.object(settings, "GLOBAL_EXTERNAL_API_KILL_SWITCH", False):
        # Exceed daily limit
        with patch.object(QuotaManager, "get_provider_limits", return_value={"daily": 2, "monthly": 10, "rpm": 5}):
            # First 2 calls pass
            a1, _, _ = await QuotaManager.check_and_reserve(unique_prov, count=1)
            a2, _, _ = await QuotaManager.check_and_reserve(unique_prov, count=1)
            # Third call is circuit broken
            a3, reason3, _ = await QuotaManager.check_and_reserve(unique_prov, count=1)
            assert a1 is True
            assert a2 is True
            assert a3 is False
            assert "limit reached" in reason3.lower()


# ------------------------------------------------------------------------------
# BraveSearchProvider Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_brave_disabled_and_mock_modes():
    disabled_prov = BraveSearchProvider(mode="disabled")
    res_dis = await disabled_prov.execute("acme corp")
    assert res_dis.status == "disabled"
    assert res_dis.quota_consumed == 0

    mock_prov = BraveSearchProvider(mode="mock")
    res_mock = await mock_prov.execute("acme corp")
    assert res_mock.status == "mock"
    assert res_mock.quota_consumed == 0
    assert len(res_mock.data["results"]) > 0


@pytest.mark.asyncio
async def test_brave_deduplication():
    prov = BraveSearchProvider(mode="mock")
    res1 = await prov.execute("unique search query 123")
    assert res1.quota_consumed == 0


@pytest.mark.asyncio
async def test_brave_live_mocked_http():
    prov = BraveSearchProvider(api_key="test-key", mode="live")

    fake_resp = {
        "web": {
            "results": [
                {
                    "title": "Acme SaaS Solutions",
                    "url": "https://www.acme.com",
                    "description": "Leading cloud automation software.",
                    "profile": {"long_name": "Acme Inc."},
                }
            ]
        }
    }

    mock_response = MagicMock(status_code=200)
    mock_response.json.return_value = fake_resp

    with patch.object(QuotaManager, "check_and_reserve", AsyncMock(return_value=(True, None, {"monthly_limit": 1600, "monthly_used": 1}))):
        with patch("httpx.AsyncClient.get", AsyncMock(return_value=mock_response)):
            result = await prov.execute("site:acme.com")
            assert result.status == "success"
            assert result.quota_consumed == 1
            assert len(result.data["results"]) == 1
            assert result.data["results"][0]["title"] == "Acme SaaS Solutions"


# ------------------------------------------------------------------------------
# GoogleGeminiProvider Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_model_enforcement():
    # Attempting to configure a paid/unsupported model must safely fallback to gemini-1.5-flash
    prov = GoogleGeminiProvider(model="claude-3-opus", mode="mock")
    assert prov.model == "gemini-1.5-flash"


@pytest.mark.asyncio
async def test_gemini_deterministic_fallback():
    prov = GoogleGeminiProvider(mode="disabled")

    # 1. Summary task
    summary_res = await prov.execute("Acme Corp", task="summary")
    assert summary_res.status == "disabled"
    assert "executive_summary" in summary_res.data
    assert "recommended_outreach_angle" in summary_res.data

    # 2. ICP match task
    icp_res = await prov.execute("Acme Corp", task="icp_match")
    assert "fit_score" in icp_res.data
    assert icp_res.data["tier"] == "Tier 1"

    # 3. Classify signals task
    signals_res = await prov.execute("Acme Corp", task="classify_signals")
    assert "detected_signals" in signals_res.data


@pytest.mark.asyncio
async def test_gemini_live_mocked_http():
    prov = GoogleGeminiProvider(api_key="valid-gemini-key", mode="live")

    fake_json_output = '{"executive_summary": "Acme is a high-growth cloud provider.", "key_strengths": ["Enterprise scale"], "pain_points_identified": ["Tech debt"], "recommended_outreach_angle": "Pitch automated compliance"}'
    fake_gemini_response = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": fake_json_output}]
                }
            }
        ]
    }

    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = fake_gemini_response

    with patch.object(QuotaManager, "check_and_reserve", AsyncMock(return_value=(True, None, {}))):
        with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_resp)):
            res = await prov.execute("Acme Corp", task="summary")
            assert res.status == "success"
            assert res.quota_consumed == 1
            assert res.data["executive_summary"] == "Acme is a high-growth cloud provider."


# ------------------------------------------------------------------------------
# SerpApiProvider Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_serpapi_mock_and_quota_info():
    prov = SerpApiProvider(mode="mock")
    res = await prov.execute("Acme Technologies")
    assert res.status == "mock"
    assert res.quota_consumed == 0
    assert len(res.data["results"]) > 0

    info = prov.get_quota_info()
    assert info["monthly_limit"] == 80


# ------------------------------------------------------------------------------
# HunterProvider Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_hunter_domain_and_verify_modes():
    prov = HunterProvider(mode="mock")

    # Domain search
    domain_res = await prov.execute("acme.com", action="domain_search")
    assert domain_res.status == "mock"
    assert "emails" in domain_res.data
    assert len(domain_res.data["emails"]) > 0

    # Email verification
    verify_res = await prov.execute("alex@acme.com", action="verify_email")
    assert verify_res.status == "mock"
    assert verify_res.data["status"] == "valid"
    assert verify_res.data["score"] > 80


# ------------------------------------------------------------------------------
# ResendProvider Tests
# ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resend_purpose_isolation():
    prov = ResendProvider(mode="mock")

    # Rejects non-transactional marketing outreach
    bad_res = await prov.execute("prospect@buyer.com", subject="Cold Outreach", purpose="marketing_campaign")
    assert bad_res.status == "error"
    assert "transactional" in bad_res.error_message.lower()

    # Allows J5 password reset
    reset_res = await prov.send_password_reset_email("user@example.com", "https://leadflow.io/reset-password?token=xyz")
    assert reset_res.status == "mock"
    assert reset_res.data["delivered"] is True
