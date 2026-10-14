import re
from typing import Any, Dict, Optional
from bs4 import BeautifulSoup

from backend.app.core.config import settings
from backend.app.domain.crawler.safe_crawler import SafeWebCrawler, SSRFValidationError
from backend.app.models.entities import Enrichment, Lead
from backend.app.repositories.enrichments import EnrichmentRepository
from backend.app.repositories.leads import LeadRepository


class CrawlerService:
    def __init__(self, lead_repo: LeadRepository, enrichment_repo: EnrichmentRepository):
        self.lead_repo = lead_repo
        self.enrichment_repo = enrichment_repo

    async def crawl_lead(
        self,
        lead: Lead,
        forced_mode: Optional[str] = None,
    ) -> Enrichment:
        """
        Executes safe crawl against lead domain adhering to configured provider mode ('mock', 'live', 'disabled').
        Persists results to enrichments table and advances lead pipeline_state to 'review'.
        """
        mode = forced_mode or settings.PROVIDER_ENRICHMENT_MODE

        if mode == "disabled":
            evidence = {
                "error": "Enrichment provider is disabled in system configuration",
                "mode": "disabled",
            }
            enrichment = await self.enrichment_repo.create_enrichment(
                lead_id=lead.id,
                provider="disabled",
                status="failed",
                crawled_url=f"https://{lead.domain}",
                evidence=evidence,
            )
            await self.lead_repo.update_pipeline_state(lead.id, "failed")
            return enrichment

        if mode == "mock":
            # Generate deterministic synthetic evidence for testing and offline development
            evidence = {
                "mode": "mock",
                "status_code": 200,
                "title": f"{lead.company_name} — Enterprise Solutions",
                "meta_description": f"Official website of {lead.company_name}. Discover modern products and services.",
                "load_time_ms": 1150.0,
                "ssl_valid": True,
                "headers": {
                    "server": "nginx",
                    "content-type": "text/html; charset=UTF-8",
                },
                "html": (
                    f"<!DOCTYPE html><html lang='en'><head>"
                    f"<title>{lead.company_name} — Enterprise Solutions</title>"
                    f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
                    f"<meta name='description' content='Official website of {lead.company_name}.'>"
                    f"</head><body>"
                    f"<header><h1>{lead.company_name}</h1><nav><a href='/pricing'>Pricing</a></nav></header>"
                    f"<main><p>Modern B2B platform delivering scalable growth.</p>"
                    f"<button type='button'>Get Started Today</button></main>"
                    f"<footer><p>&copy; 2026 {lead.company_name}</p></footer>"
                    f"</body></html>"
                ),
                "h1": lead.company_name,
                "has_viewport": True,
                "ctas_found": ["Get Started Today"],
                "detected_tech": ["Next.js", "Vercel", "Google Analytics 4"],
            }
            enrichment = await self.enrichment_repo.create_enrichment(
                lead_id=lead.id,
                provider="mock_crawler",
                status="success",
                crawled_url=f"https://{lead.domain}",
                evidence=evidence,
            )
            await self.lead_repo.update_pipeline_state(lead.id, "review")
            return enrichment

        # LIVE MODE: Enforce full SSRF protection and live crawling
        target_url = f"https://{lead.domain}"
        crawler = SafeWebCrawler(
            max_bytes=settings.CRAWLER_MAX_RESPONSE_BYTES,
            timeout_seconds=settings.CRAWLER_TIMEOUT_SECONDS,
        )

        try:
            crawl_data = await crawler.fetch_page(target_url)

            # Fallback to HTTP if initial HTTPS attempt failed with connection error (and not SSRF)
            if crawl_data.status_code == 0 and "SSRF" not in str(crawl_data.external_data):
                http_target = f"http://{lead.domain}"
                crawl_data = await crawler.fetch_page(http_target)

            # Parse HTML structure with BeautifulSoup
            soup = BeautifulSoup(crawl_data.html or "", "html.parser")
            title = soup.title.string.strip() if (soup.title and soup.title.string) else ""
            meta_desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
            meta_desc = meta_desc_tag.get("content", "").strip() if meta_desc_tag else ""

            # Detect CTAs
            ctas = []
            for btn in soup.find_all(["button", "a"]):
                text = btn.get_text(strip=True).lower()
                if any(w in text for w in ("get started", "book demo", "contact", "sign up", "free trial", "schedule")):
                    ctas.append(btn.get_text(strip=True))

            # Detect tech signatures in scripts/meta
            html_lower = (crawl_data.html or "").lower()
            detected_tech = []
            if "wp-content" in html_lower or "wordpress" in html_lower:
                detected_tech.append("WordPress")
            if "shopify" in html_lower:
                detected_tech.append("Shopify")
            if "gtag" in html_lower or "google-analytics" in html_lower or "googletagmanager" in html_lower:
                detected_tech.append("Google Analytics")
            if "hubspot" in html_lower or "hs-scripts" in html_lower:
                detected_tech.append("HubSpot")

            # Optional Google PageSpeed Core Web Vitals audit
            if settings.PROVIDER_PAGESPEED_MODE in ("live", "mock"):
                from backend.app.providers.pagespeed import GooglePageSpeedProvider
                ps_provider = GooglePageSpeedProvider()
                ps_result = await ps_provider.execute(target_url)
                if ps_result.status in ("success", "mock"):
                    crawl_data.external_data["pagespeed"] = ps_result.data

            # Optional Firecrawl JS scraping audit (Strictly within free tier quotas)
            if settings.PROVIDER_FIRECRAWL_MODE in ("live", "mock"):
                from backend.app.providers.firecrawl import FirecrawlProvider
                fc_provider = FirecrawlProvider()
                fc_result = await fc_provider.execute(target_url)
                if fc_result.status in ("success", "mock"):
                    crawl_data.external_data["firecrawl"] = fc_result.data

            status = "success" if (200 <= crawl_data.status_code < 400) else "partial"
            if crawl_data.status_code == 0:
                status = "failed"

            evidence = {
                "mode": "live",
                "status_code": crawl_data.status_code,
                "title": title,
                "meta_description": meta_desc,
                "load_time_ms": crawl_data.load_time_ms,
                "ssl_valid": crawl_data.ssl_valid,
                "headers": crawl_data.headers,
                "html": crawl_data.html[:50000],  # Store up to 50KB in evidence JSON
                "ctas_found": ctas[:10],
                "detected_tech": detected_tech,
                "external_data": crawl_data.external_data,
            }

            enrichment = await self.enrichment_repo.create_enrichment(
                lead_id=lead.id,
                provider="safe_crawler",
                status=status,
                crawled_url=crawl_data.url or target_url,
                evidence=evidence,
            )

            new_pipeline_state = "review" if status in ("success", "partial") else "failed"
            await self.lead_repo.update_pipeline_state(lead.id, new_pipeline_state)
            return enrichment

        except SSRFValidationError as ssrf_err:
            evidence = {
                "mode": "live",
                "error": f"SSRF Protection Blocked Request: {str(ssrf_err)}",
                "status_code": 0,
                "blocked": True,
            }
            enrichment = await self.enrichment_repo.create_enrichment(
                lead_id=lead.id,
                provider="safe_crawler",
                status="failed",
                crawled_url=target_url,
                evidence=evidence,
            )
            await self.lead_repo.update_pipeline_state(lead.id, "failed")
            return enrichment
        except Exception as exc:
            evidence = {
                "mode": "live",
                "error": f"Unexpected crawl error: {str(exc)}",
                "status_code": 0,
            }
            enrichment = await self.enrichment_repo.create_enrichment(
                lead_id=lead.id,
                provider="safe_crawler",
                status="failed",
                crawled_url=target_url,
                evidence=evidence,
            )
            await self.lead_repo.update_pipeline_state(lead.id, "failed")
            return enrichment
