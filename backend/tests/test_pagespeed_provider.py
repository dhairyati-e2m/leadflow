import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from bs4 import BeautifulSoup

from backend.app.domain.signals.evaluators import CrawlData, evaluate_slow_site
from backend.app.providers.pagespeed import GooglePageSpeedProvider


@pytest.mark.asyncio
async def test_pagespeed_disabled_mode():
    provider = GooglePageSpeedProvider(mode="disabled")
    result = await provider.execute("https://example.com")
    assert result.status == "disabled"
    assert result.quota_consumed == 0
    assert "disabled" in result.error_message.lower()


@pytest.mark.asyncio
async def test_pagespeed_mock_mode():
    provider = GooglePageSpeedProvider(mode="mock")
    result = await provider.execute("https://example.com")
    assert result.status == "mock"
    assert result.quota_consumed == 0
    assert result.data["performance_score"] == 88.0
    assert result.data["core_web_vitals_passed"] is True
    assert result.data["largest_contentful_paint_ms"] == 1420.0


@pytest.mark.asyncio
async def test_pagespeed_live_missing_key():
    provider = GooglePageSpeedProvider(api_key=None, mode="live")
    result = await provider.execute("https://example.com")
    assert result.status == "fallback"
    assert "missing" in result.error_message.lower()


@pytest.mark.asyncio
async def test_pagespeed_live_quota_exceeded():
    provider = GooglePageSpeedProvider(api_key="test-key", mode="live")
    # Simulate usage hitting daily limit
    provider._daily_usage_cache[provider._get_today_key()] = 25000

    result = await provider.execute("https://example.com")
    assert result.status == "fallback"
    assert "exhausted" in result.error_message.lower()
    assert result.quota_remaining == 0


@pytest.mark.asyncio
async def test_pagespeed_live_success():
    provider = GooglePageSpeedProvider(api_key="valid-test-key", mode="live")

    fake_response = {
        "lighthouseResult": {
            "categories": {
                "performance": {"score": 0.92}
            },
            "audits": {
                "largest-contentful-paint": {"numericValue": 1250.4},
                "first-contentful-paint": {"numericValue": 800.0},
                "cumulative-layout-shift": {"numericValue": 0.04},
                "speed-index": {"numericValue": 1100.0},
                "total-blocking-time": {"numericValue": 85.0},
            }
        }
    }

    from unittest.mock import MagicMock
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_response

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock, return_value=mock_resp):
        result = await provider.execute("https://example.com")

    assert result.status == "success"
    assert result.quota_consumed == 1
    assert result.data["performance_score"] == 92.0
    assert result.data["largest_contentful_paint_ms"] == 1250.4
    assert result.data["core_web_vitals_passed"] is True


@pytest.mark.asyncio
async def test_pagespeed_rate_limit_429():
    provider = GooglePageSpeedProvider(api_key="valid-test-key", mode="live")

    from unittest.mock import MagicMock
    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Quota exceeded"

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock, return_value=mock_resp):
        result = await provider.execute("https://example.com")

    assert result.status == "fallback"
    assert "429" in result.error_message


def test_evaluate_slow_site_with_pagespeed_data():
    crawl_with_ps = CrawlData(
        url="https://example.com",
        load_time_ms=1500.0,
        external_data={
            "pagespeed": {
                "performance_score": 90.0,
                "largest_contentful_paint_ms": 1100.0,
                "core_web_vitals_passed": True,
            }
        }
    )
    soup = BeautifulSoup("<html></html>", "html.parser")
    sig = evaluate_slow_site(crawl_with_ps, soup)

    assert sig.available is True
    assert sig.source == "pagespeed_v5"
    assert sig.normalized_score == 10.0  # 100 - 90 = 10 (low opportunity / fast)
    assert sig.confidence == 0.98


def test_evaluate_slow_site_fallback_to_crawl_timing():
    crawl_without_ps = CrawlData(
        url="https://example.com",
        load_time_ms=2800.0,
        external_data={}
    )
    soup = BeautifulSoup("<html></html>", "html.parser")
    sig = evaluate_slow_site(crawl_without_ps, soup)

    assert sig.available is True
    assert sig.source == "crawler_latency"
    assert sig.normalized_score == 65.0  # > 2000ms threshold
    assert sig.confidence == 0.90
