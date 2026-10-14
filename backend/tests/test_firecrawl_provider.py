import pytest
from backend.app.providers.firecrawl import FirecrawlProvider
from backend.app.domain.crawler.safe_crawler import SafeWebCrawler


@pytest.mark.asyncio
async def test_firecrawl_provider_mock_mode():
    """Validates FirecrawlProvider operates in mock mode with zero cost and valid synthetic markdown/html."""
    provider = FirecrawlProvider(api_key="mock_key", mode="mock")
    result = await provider.execute("https://example.com")

    assert result.status == "mock"
    assert result.provider_key == "firecrawl"
    assert result.quota_consumed == 0
    assert result.data["success"] is True
    assert "example.com" in result.data["data"]["markdown"]
    assert result.data["data"]["metadata"]["statusCode"] == 200


@pytest.mark.asyncio
async def test_firecrawl_provider_disabled_mode():
    """Validates FirecrawlProvider disabled mode returns disabled status without network activity."""
    provider = FirecrawlProvider(api_key="mock_key", mode="disabled")
    result = await provider.execute("https://example.com")

    assert result.status == "disabled"
    assert result.quota_consumed == 0
    assert result.data["scraped"] is False


@pytest.mark.asyncio
async def test_firecrawl_provider_invalid_target():
    """Validates FirecrawlProvider handles malformed target URL gracefully."""
    provider = FirecrawlProvider(api_key="mock_key", mode="mock")
    result = await provider.execute("://bad-url")

    assert result.status == "error"
    assert "Invalid target URL" in (result.error_message or "")


def test_safecrawler_robots_txt_allow_check():
    """Validates SafeCrawler robots.txt checker function behaves safely."""
    crawler = SafeWebCrawler()
    # Disallowed path for all user agents
    disallowed_robots = "User-agent: *\nDisallow: /admin/\nDisallow: /private/\n"
    assert crawler.is_url_allowed_by_robots("https://example.com/admin/settings", disallowed_robots) is False
    assert crawler.is_url_allowed_by_robots("https://example.com/private/data", disallowed_robots) is False
    assert crawler.is_url_allowed_by_robots("https://example.com/about", disallowed_robots) is True
    assert crawler.is_url_allowed_by_robots("https://example.com/", disallowed_robots) is True

    # Empty robots.txt allows everything
    assert crawler.is_url_allowed_by_robots("https://example.com/admin/test", "") is True
