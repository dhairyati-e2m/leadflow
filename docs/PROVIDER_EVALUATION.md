# Candidate Provider Evaluation Matrix

In strict compliance with **Mandatory Rule A (Free services and open-source software only)** and **Mandatory Rule B (Never assume an API is free)**, this document evaluates every candidate provider considered for LeadFlow's 22-signal qualification engine, lead research, crawling, performance, CRM synchronization, AI drafting, and application hosting.

---

## 1. Provider Evaluation Summary

| Provider | Category | Verified Free Allowance | Commercial Use | Credit Card Required? | Recommended Default Mode | Final Recommendation |
|---|---|---|---|---|---|---|
| **Local Safe Crawler** (`httpx` + BeautifulSoup) | Website Crawling | Unlimited local execution | Yes (MIT/BSD open source) | No | `live` (native) | **Active Primary Baseline** |
| **Playwright** | Browser Automation | Unlimited local execution (consumes local RAM/CPU) | Yes (Apache 2.0 open source) | No | `disabled` (optional local) | **Defer**: Resource-heavy; native parser suffices for 21 signals |
| **Google PageSpeed Insights API** | Core Web Vitals & Performance | **25,000 queries/day** (~1 req/sec without key, 25k/day with free Google Cloud key) | Yes | **No** | `disabled` until key provided, then `live` | **Approve as 1st Live Provider** |
| **Google Lighthouse CLI** | Performance / SEO (Local) | Unlimited local runs (requires headless Chrome installed) | Yes (Apache 2.0 open source) | No | `disabled` | **Defer**: PageSpeed API covers remote devices without Chrome install |
| **Google Search Console API** | Search Impressions & Indexing | Free API access | Yes | No | `disabled` | **Reject**: Requires verified property ownership; unusable for 3rd-party prospects |
| **OpenStreetMap / Nominatim** | Address / Geocoding | Max 1 req/sec with mandatory User-Agent | Yes (ODbL, with attribution) | No | `disabled` | **Restricted**: Geocoding only; does not provide company data or reviews |
| **Public Company Datasets** (SEC EDGAR, OpenCorporates public) | Corporate Registration | Free public access (rate-limited) | Yes (Public domain / Open data) | No | `disabled` | **Viable secondary offline source** |
| **Apollo.io** | Lead & Contact Discovery | 50 email exports/mo in web UI only. **API is NOT included in free tier** ($49+/mo required). | Restricted | Yes for API | `disabled` | **Reject for Automated API**: Scraping dashboard violates ToS |
| **Hunter.io** | Email Discovery & Domain Search | **25 searches and 50 verifications/month** via free API key | Yes | **No** | `disabled` until key provided | **Eligible with Strict Quota Guard**: Fast exhaustion (~1 call/day) |
| **Snov.io** | Contact Discovery | 50 credits one-time trial upon registration. **No recurring free API tier** ($39+/mo). | Restricted | Yes after trial | `disabled` | **Reject as Permanent Free Provider** |
| **The Companies API** | Company Firmographics | 50 trial calls, then mandatory paid subscription. | Restricted | Yes after trial | `disabled` | **Reject as Permanent Free Provider** |
| **Apify** | Web Scraping Actors | $5/month prepaid credit pool. Consumes quickly on cloud browser actors. | Yes | No | `disabled` | **Defer**: Local crawler has zero monthly recurring cost |
| **Firecrawl (Hosted)** | Web Crawling API | 500 one-off trial credits, then $16+/mo. | Restricted | Yes after trial | `disabled` | **Reject Hosted Cloud**: Local safe crawler is permanent free alternative |
| **Firecrawl (Self-Hosted)** | Open-Source Crawler | Unlimited local runs (requires Docker, Redis, Playwright) | Yes (AGPL-3.0) | No | `disabled` | **Defer**: High local memory footprint compared to native `httpx` |
| **HubSpot Developer Platform** | CRM Synchronization | Free Developer Test Portal & Private App token (100 req/10s) | Yes (Development/Testing) | **No** | `disabled` until OAuth/token setup | **Approve for Phase 8 CRM Sync** |
| **OpenRouter** | AI Personalization | `:free` models available (e.g. `meta-llama/llama-3-8b-instruct:free`), 20 req/min, 200/day | Permitted by model licenses | No | `disabled` | **Eligible as Optional AI**: Must maintain deterministic template fallback |
| **Railway** | Cloud Application Hosting | $5 one-time credit expiring in 30 days; $5/mo Hobby plan required thereafter | Yes | Yes after trial | N/A (Deployment) | **Documented as Optional Hosting**: Local Docker Compose is free baseline |

---

## 2. In-Depth Provider Profiles

### 2.1 Local Safe Web Crawler (`httpx` + BeautifulSoup)
- **Vendor / Origin**: Self-hosted Python open-source stack (`httpx`, `beautifulsoup4`, `lxml`).
- **Relevant Signals**: 21 out of 22 signals (CMS detection, HTML5 structure, conversion CTAs, responsive viewport, SSL, word count, analytics scripts, accessibility heuristics, chat widgets, SEO title/meta/canonical, JSON-LD Schema.org, spam TLD heuristics, blog timestamps, newsroom links, case study links, embedded video, social links, email capture forms, ad tracking pixels, careers links).
- **Pricing & Terms**: Free forever. No API keys, no network quotas, no external data retention.
- **SSRF Safety**: Implemented in [safe_crawler.py](file:///c:/Users/Dhairyati%20Pandya/Desktop/leadflow/backend/app/domain/crawler/safe_crawler.py). Rejects private IPs (RFC 1918), loopback, link-local, cloud metadata (`169.254.169.254`), and non-HTTP schemes before establishing TCP connections.
- **Recommendation**: **Active Primary Baseline**.

---

### 2.2 Google PageSpeed Insights API
- **Vendor / Documentation**: Google Developers ([Documentation](https://developers.google.com/speed/docs/insights/v5/get-started)).
- **Relevant Signals**: `slow_site`, `not_mobile_friendly`, `accessibility`.
- **Data Provided**: Real-world Chrome User Experience Report (CrUX) metrics: Largest Contentful Paint (LCP), Interaction to Next Paint (INP), Cumulative Layout Shift (CLS), Lighthouse lab scores for performance, accessibility, SEO, and best practices.
- **Verified Free Allowance**: **25,000 queries per day**. Unauthenticated queries are throttled to ~1 req/sec; authenticated queries with a free Google Cloud API key support 25,000 requests/day.
- **Billing / Credit Card**: **No billing or credit card required**. Free Google Cloud projects can generate API keys without adding payment information.
- **Safety / Failover**: If API key is missing or quota is exhausted, LeadFlow fails over immediately to local HTTP asset timing heuristics without blocking lead processing.
- **Recommendation**: **Approve as 1st Live Provider**.

---

### 2.3 Hunter.io
- **Vendor / Documentation**: Hunter Web Services, Inc. ([Documentation](https://hunter.io/api-documentation/v2)).
- **Relevant Signals / Workflows**: Domain email search, email address format verification for prospect contacts.
- **Data Provided**: Domain patterns (`{first}.{last}@company.com`), public email sources, SMTP MX deliverability check.
- **Verified Free Allowance**: **25 searches and 50 email verifications per month**.
- **Limitations**: 25 searches/month is consumed rapidly. If LeadFlow processes a 100-lead CSV, Hunter will exhaust on the 25th lead.
- **Billing / Credit Card**: Free account does not require a credit card.
- **Integration Policy**:
  - Daily safety budget: 1 search per day.
  - Hard cutoff at 20 searches/month (80% warning threshold).
  - When budget is reached, transitions to `paused_quota_exhausted` and falls back to masked offline contact cards.
- **Recommendation**: **Eligible under strict quota guard; must not be relied upon as bulk data engine**.

---

### 2.4 Apollo.io
- **Vendor / Documentation**: ZenProspect, Inc. dba Apollo.io ([API Documentation](https://apolloio.github.io/apollo-api-docs/)).
- **Official Terms Finding**: Apollo's free account provides 50 email credits/month inside their web app interface. However, **official REST API access is restricted to paid plans** (starting at $49/user/month).
- **Terms of Service**: Section 4.2 strictly prohibits automated scraping, reverse engineering private dashboard endpoints, or bot querying.
- **Recommendation**: **Reject for automated live API calls**. Retain `disabled` adapter stub to prevent ToS violations and surprise billing.

---

### 2.5 Snov.io
- **Vendor / Documentation**: Snov.io Inc. ([API Documentation](https://snov.io/api)).
- **Official Terms Finding**: The free tier is a **one-time 50-credit trial**, not a recurring monthly allowance. Once the 50 credits are spent, all subsequent API calls return billing upgrade errors.
- **Recommendation**: **Reject as a permanent free provider**. Cannot sustain recurring SaaS operations without credit card billing.

---

### 2.6 OpenRouter
- **Vendor / Documentation**: OpenRouter ([Documentation](https://openrouter.ai/docs)).
- **Relevant Workflows**: AI-assisted personalized outreach drafting (Phase 7).
- **Verified Free Allowance**: Offers designated `:free` models (such as `meta-llama/llama-3-8b-instruct:free`). Free models have a 20 request/minute rate limit and 200 requests/day cap.
- **Safety & Fallback**:
  - Untrusted web content must be sanitized to protect against prompt injection.
  - Deterministic template engine in LeadFlow serves as the 100% offline, zero-token primary baseline.
  - OpenRouter adapter remains disabled until explicitly authorized with approved model selection.
- **Recommendation**: **Eligible for optional AI drafting, with mandatory deterministic template fallback**.

---

### 2.7 HubSpot Developer Platform
- **Vendor / Documentation**: HubSpot, Inc. ([Developer Documentation](https://developers.hubspot.com/)).
- **Relevant Workflows**: CRM contact and company synchronization (Phase 8).
- **Verified Free Allowance**: Free Developer Test Accounts permit up to 100 requests per 10 seconds. Private App tokens allow creating companies, contacts, and notes without paid sales/marketing hubs.
- **Recommendation**: **Approve for Phase 8 CRM Integration**.

---

### 2.8 Railway Application Hosting
- **Vendor / Documentation**: Railway Corp. ([Pricing Documentation](https://docs.railway.app/reference/pricing)).
- **Hosting Model**: Containerized PaaS supporting FastAPI backend, Next.js frontend, PostgreSQL 16 plugin, and Redis 7 plugin.
- **Cost Finding**: Railway provides a **$5 one-time trial credit expiring in 30 days**. After 30 days or $5 consumption, execution halts unless a credit card is provided for the Hobby plan ($5/month base + $0.000231/GB-hr RAM).
- **Recommendation**: **Document deployment specifications, but maintain local Docker Compose as the 100% free baseline**. Do not provision live Railway instances without explicit user authorization.
