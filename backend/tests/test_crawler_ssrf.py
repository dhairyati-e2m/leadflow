import pytest
from backend.app.domain.crawler.safe_crawler import (
    SSRFValidationError,
    SafeWebCrawler,
    validate_ip_address_safety,
)


def test_ssrf_rejects_loopback_and_private_ips():
    # Loopback
    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("127.0.0.1")

    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("127.0.1.100")

    # Private ranges (RFC 1918)
    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("10.0.0.1")

    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("172.16.5.10")

    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("192.168.1.1")

    # Cloud metadata endpoint
    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("169.254.169.254")

    # IPv6 loopback & private
    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("::1")

    with pytest.raises(SSRFValidationError):
        validate_ip_address_safety("fc00::1")


def test_ssrf_accepts_public_ips():
    # Public DNS root & Cloudflare / Google public IPs
    assert validate_ip_address_safety("8.8.8.8") is None
    assert validate_ip_address_safety("1.1.1.1") is None
    assert validate_ip_address_safety("93.184.216.34") is None  # example.com


@pytest.mark.asyncio
async def test_crawler_rejects_forbidden_schemes():
    crawler = SafeWebCrawler()
    with pytest.raises(SSRFValidationError):
        await crawler.fetch_page("file:///etc/passwd")

    with pytest.raises(SSRFValidationError):
        await crawler.fetch_page("ftp://example.com/file.txt")

    with pytest.raises(SSRFValidationError):
        await crawler.fetch_page("http://127.0.0.1:8000/admin")

    with pytest.raises(SSRFValidationError):
        await crawler.fetch_page("http://169.254.169.254/latest/meta-data/")
