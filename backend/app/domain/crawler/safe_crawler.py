import asyncio
import ipaddress
import socket
import time
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
import urllib.robotparser
import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from backend.app.domain.signals.evaluators import CrawlData


class SSRFValidationError(Exception):
    """Raised when a URL attempts to resolve to a forbidden private, loopback, or metadata IP."""
    pass


# Forbidden IP Networks for outbound crawler requests
FORBIDDEN_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),          # Current network
    ipaddress.ip_network("10.0.0.0/8"),         # Private-use (RFC 1918)
    ipaddress.ip_network("100.64.0.0/10"),      # Shared Address Space
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback (127.0.0.1)
    ipaddress.ip_network("169.254.0.0/16"),     # Link-Local & Cloud Metadata (169.254.169.254)
    ipaddress.ip_network("172.16.0.0/12"),      # Private-use (RFC 1918)
    ipaddress.ip_network("192.0.0.0/24"),       # IETF Protocol Assignments
    ipaddress.ip_network("192.0.2.0/24"),       # TEST-NET-1
    ipaddress.ip_network("192.88.99.0/24"),     # 6to4 Relay Anycast
    ipaddress.ip_network("192.168.0.0/16"),     # Private-use (RFC 1918)
    ipaddress.ip_network("198.18.0.0/15"),      # Network benchmark tests
    ipaddress.ip_network("198.51.100.0/24"),    # TEST-NET-2
    ipaddress.ip_network("203.0.113.0/24"),     # TEST-NET-3
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved
    ipaddress.ip_network("255.255.255.255/32"), # Limited Broadcast
    # IPv6 forbidden ranges
    ipaddress.ip_network("::/128"),             # Unspecified
    ipaddress.ip_network("::1/128"),            # Loopback
    ipaddress.ip_network("fc00::/7"),           # Unique Local Address (ULA)
    ipaddress.ip_network("fe80::/10"),          # Link-local unicast
    ipaddress.ip_network("ff00::/8"),           # Multicast
]


def validate_ip_address_safety(ip_str: str) -> None:
    """Validates that a resolved IP address does not belong to any forbidden or private ranges."""
    ip_obj = ipaddress.ip_address(ip_str)

    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_reserved:
        raise SSRFValidationError(f"Target IP {ip_str} is private, loopback, or reserved (SSRF protection).")

    for network in FORBIDDEN_NETWORKS:
        if ip_obj in network:
            raise SSRFValidationError(f"Target IP {ip_str} belongs to blocked subnet {network} (SSRF protection).")


def resolve_and_validate_hostname(hostname: str) -> str:
    """Pre-resolves DNS and guarantees that every resolved IP is public and safe."""
    if not hostname:
        raise SSRFValidationError("Empty hostname provided.")

    # Check if hostname is an IP literal
    try:
        ipaddress.ip_address(hostname)
        validate_ip_address_safety(hostname)
        return hostname
    except ValueError:
        pass  # It's a DNS domain name

    try:
        addrinfo = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        if not addrinfo:
            raise SSRFValidationError(f"Unable to resolve DNS for hostname {hostname}")

        resolved_ips = {item[4][0] for item in addrinfo}
        for ip in resolved_ips:
            validate_ip_address_safety(ip)

        # Return first validated IP
        return next(iter(resolved_ips))
    except socket.gaierror as e:
        raise SSRFValidationError(f"DNS resolution failure for {hostname}: {e}")


# In-memory Domain Crawl Cache (10-minute TTL)
_CRAWL_CACHE: Dict[str, Tuple[float, CrawlData]] = {}
CACHE_TTL_SECONDS = 600.0


class SafeWebCrawler:
    """
    Production-grade SSRF-protected website crawler.
    Enforces scheme validation, DNS pre-resolution, redirect re-validation,
    response size limits, in-memory domain caching, and hard execution timeouts.
    """

    def __init__(
        self,
        max_bytes: int = 2 * 1024 * 1024,  # 2MB limit
        timeout_seconds: float = 10.0,
        user_agent: str = "LeadFlow-Auditor/1.0 (+https://leadflow.app/bot)",
    ):
        self.max_bytes = max_bytes
        self.timeout_seconds = timeout_seconds
        self.user_agent = user_agent

    def is_url_allowed_by_robots(self, url: str, robots_txt_content: Optional[str] = None) -> bool:
        """Lightweight robots.txt compliance check."""
        if not robots_txt_content:
            return True
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(robots_txt_content.splitlines())
            return rp.can_fetch(self.user_agent, url)
        except Exception:
            return True

    async def fetch_page(self, target_url: str) -> CrawlData:
        """
        Safely fetches an HTML page with multi-hop SSRF validation, caching, and response clamping.
        """
        parsed = urlparse(target_url)
        if parsed.scheme.lower() not in ("http", "https"):
            raise SSRFValidationError(f"Unsupported URI scheme: {parsed.scheme}. Only HTTP/HTTPS permitted.")

        # Pre-resolve and validate host
        hostname = parsed.hostname
        if not hostname:
            raise SSRFValidationError(f"Invalid target URL: {target_url}")

        validated_ip = resolve_and_validate_hostname(hostname)

        # Check in-memory cache
        cache_key = f"{parsed.scheme.lower()}://{hostname.lower()}"
        now_ts = time.time()
        if cache_key in _CRAWL_CACHE:
            cached_time, cached_data = _CRAWL_CACHE[cache_key]
            if (now_ts - cached_time) < CACHE_TTL_SECONDS:
                return cached_data

        # Track start time for latency measurement
        start_time = time.perf_counter()
        headers = {"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"}

        current_url = target_url
        max_redirects = 3
        redirect_count = 0

        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            follow_redirects=False,  # Manually handle redirects to validate IP at each hop!
            verify=True,
        ) as client:
            while redirect_count <= max_redirects:
                # Validate current URL host before making request
                curr_parsed = urlparse(current_url)
                if curr_parsed.scheme.lower() not in ("http", "https"):
                    raise SSRFValidationError(f"Redirected to disallowed scheme: {curr_parsed.scheme}")
                resolve_and_validate_hostname(curr_parsed.hostname or "")

                try:
                    response = await client.get(current_url, headers=headers)
                except httpx.RequestError as exc:
                    return CrawlData(
                        url=target_url,
                        status_code=0,
                        html="",
                        load_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
                        ssl_valid=False,
                        external_data={"error": f"Request failed: {str(exc)}"},
                    )

                if response.is_redirect:
                    redirect_count += 1
                    if redirect_count > max_redirects:
                        return CrawlData(
                            url=target_url,
                            status_code=response.status_code,
                            html="",
                            load_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
                            external_data={"error": "Too many redirects"},
                        )
                    location = response.headers.get("location")
                    if not location:
                        break
                    current_url = urljoin(current_url, location)
                    continue
                else:
                    break

            load_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            content_bytes = response.content[: self.max_bytes]
            # Decode HTML safely
            try:
                html_text = content_bytes.decode(response.encoding or "utf-8", errors="replace")
            except Exception:
                html_text = content_bytes.decode("utf-8", errors="replace")

            is_ssl = urlparse(current_url).scheme.lower() == "https"

            result = CrawlData(
                url=current_url,
                status_code=response.status_code,
                headers=dict(response.headers),
                html=html_text,
                load_time_ms=load_time_ms,
                ssl_valid=is_ssl,
                external_data={
                    "redirect_count": redirect_count,
                    "final_url": current_url,
                    "truncated": len(response.content) > self.max_bytes,
                },
            )

            if response.status_code == 200:
                _CRAWL_CACHE[cache_key] = (now_ts, result)

            return result
