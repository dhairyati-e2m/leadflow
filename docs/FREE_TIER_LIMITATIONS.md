# Free-Tier & Open-Source Provider Strategy

In strict adherence to **Mandatory Rule A (Free services and open-source software only)**, this document catalogs all external integrations, their verified free-tier status, quota boundaries, and zero-cost fallback mechanisms.

---

## Provider Evaluation Matrix

| Category | Provider / Tool | License / Free Plan Tier | Free Quota / Limits | Fallback Strategy | Active Default Mode |
|---|---|---|---|---|---|
| **Lead Sourcing** | CSV Import | MIT / Standard File Format | Unlimited local processing | Guaranteed baseline | `live` (native) |
| **Lead Sourcing (API)** | Apollo.io | Free account | Very limited API credits; strictly requires verification | Keep disabled unless verified free API is available | `disabled` |
| **Website Crawling** | `httpx` + `BeautifulSoup4` + `lxml` | BSD / MIT Open Source | Unlimited local execution | Self-hosted safe crawler | `live` (native) |
| **Robots Rules** | `urllib.robotparser` | Python Standard Library | Unlimited local execution | Safe local parser | `live` (native) |
| **Performance / Core Web Vitals** | Google PageSpeed Insights API | Free Google API key | 25,000 queries/day (free tier) | Local lightweight HTTP heuristics | `mock` / `disabled` until API key provided |
| **Performance (Local)** | Lighthouse CLI / Python heuristics | Apache 2.0 | Unlimited local execution (requires headless Chrome) | Lightweight HTTP asset timing | `live` (heuristics) |
| **Accessibility (a11y)** | axe-core / Local HTML Heuristics | MPL 2.0 / Local regex & DOM | Unlimited local execution | Local DOM semantic & alt-tag audit | `live` (native) |
| **SEO Discovery** | Local DOM Parser | Built-in | Unlimited local execution | Title, meta description, canonical, robots, sitemap parser | `live` (native) |
| **Answer Engine / Schema (AEO)** | Schema.org JSON-LD Parser | Built-in | Unlimited local execution | Extracts `@type` Organization, LocalBusiness, FAQ | `live` (native) |
| **Reviews & Ratings** | OpenStreetMap / Nominatim | ODbL / Free OSM Usage Policy | Max 1 req/sec; location/places only | Mark review signal `available: false` (no fake data) | `disabled` |
| **AI Outreach & Explanations** | Deterministic Template Engine | Built-in | Unlimited, 0 tokens, 0 cost | Deterministic rule-based copy | `live` (default) |
| **AI Outreach (Optional LLM)** | Ollama (Local) OR Free OpenAI-compatible | Local open weights OR Verified free endpoint | Hardware-bound (local) or provider rate limit | Deterministic templates | `disabled` until configured |
| **CRM Synchronization** | HubSpot Free Developer Account | Free Developer Account / App | 100 requests / 10 seconds | CSV Export baseline | `disabled` until app configured |
| **Database** | PostgreSQL 16 | PostgreSQL License (OSI approved) | Unlimited self-hosted | Native or Docker container | `live` (local) |
| **Queue & Cache** | Redis 7 / Valkey | BSD / Open Source | Unlimited self-hosted | Native or Docker container | `live` (local) |

---

## Strict Rules Governing External Integrations

1. **No Silent Billable Requests:** No API that requires credit card activation or automatic overage billing may be initialized without explicit owner authorization.
2. **Deterministic Baseline:** The entire 22-signal scoring engine, CSV import pipeline, review approval workflow, and CSV export work 100% offline without any third-party API key.
3. **No Synthetic Data as Live Data:** When a provider is in `mock` mode, results are visibly labeled `[MOCK]`. When in `disabled` mode, signals report `available: false`. Missing data never generates fake scores or hallucinations.
