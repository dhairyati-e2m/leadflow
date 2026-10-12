# LeadFlow Implementation Plan & Status Tracking

This document outlines the detailed roadmap for LeadFlow across all phases. Each phase has strict acceptance criteria and configuration checkpoints.

---

## Phase Status Summary

| Phase | Description | Status | Manual Config Required? |
|---|---|---|---|
| **Phase 0** | Repository Inspection & Implementation Plan | **Completed** | No |
| **Phase 1** | Foundation (Backend, Database, Redis, CI) | **Completed** | No |
| **Phase 2** | Authentication & Tenant Isolation (RLS) | **Completed** | No |
| **Phase 3** | CSV Import & Safe Website Crawler | **Completed** | No |
| **Phase 4** | The 22-Signal Qualification Engine | **Completed** | No |
| **Phase 5** | Job Orchestration (ARQ & Redis) | Up Next | No (Local Redis queue) |
| **Phase 6** | Free Live Integrations Evaluation & Adapters | Pending | Yes (Provider by provider confirmation) |
| **Phase 7** | Human Review, Approval & Optional AI Drafting | Pending | Optional (Free LLM / Ollama configuration) |
| **Phase 8** | CRM Integration (HubSpot Free Developer App) | Pending | Yes (HubSpot Private App / OAuth setup) |
| **Phase 9** | Production Hardening, Security & Load Testing | Pending | No |
| **Phase 10** | Final System Review & Documentation | Pending | No |

---

## Detailed Phase Breakdown

### Phase 0: Repository Inspection and Implementation Plan
- [x] Inspect existing workspace, operating system, and installed runtimes.
- [x] Identify installed tools: Python 3.12.6, Node.js 24.21.0, npm 11.19.0, Git 2.56.0; note Docker missing.
- [x] Initialize Git repository and secure `.gitignore`.
- [x] Document ADRs, Free-Tier Limitations matrix, Architecture, and Implementation Plan.
- [ ] Present inspection findings and obtain user confirmation on development database strategy.
- **Checkpoint:** STOP and await user confirmation.

---

### Phase 1: Foundation
- **Goals:** Establish the modular monolith structure with running backend, frontend skeleton, and local database migrations.
- **Backend:**
  - Setup Python virtual environment (`.venv`).
  - Configure `pyproject.toml` with FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, asyncpg / psycopg, ARQ, pytest.
  - Setup Alembic migration baseline.
  - Create database connection manager with RLS session hooks.
  - Implement `/v1/health` and `/v1/ready` endpoints.
- **Frontend:**
  - Initialize Next.js 15 (TypeScript, Tailwind CSS, App Router).
  - Configure API client pointing to backend.
- **Infrastructure:**
  - Configure `.env.example` with safe defaults.
  - Provide Docker Compose (if Docker installed) or native service connection configs.
  - Add synthetic database seed script.
- **Verification:** Unit test database connection, verify migrations run cleanly, verify health checks return 200 OK.

---

### Phase 2: Authentication and Tenant Isolation
- **Goals:** Multi-tenant organization boundaries, user accounts, and PostgreSQL Row-Level Security (RLS).
- **Deliverables:**
  - [x] Entities: `orgs`, `users`, `memberships`, `audit_log`.
  - [x] Roles: `owner`, `admin`, `analyst`, `reviewer`.
  - [x] Secure local authentication (bcrypt password hashing, short-lived JWT access tokens, rotating refresh tokens).
  - [x] PostgreSQL RLS policies ensuring tenant isolation at the database layer (`SET LOCAL app.current_org_id = :org_id`).
  - [x] Tenant-scoped repository pattern in FastAPI dependencies.
  - [x] Cross-tenant security tests executing queries under a non-superuser PostgreSQL role (`leadflow_app`).
  - [x] Multi-tenant organization switching, invite flow, and RBAC permission checks.
- **Verification:** Test that Organization A's users cannot read, mutate, or query Organization B's data under any condition. All 26 unit and security tests passing.

---

### Phase 3: CSV Import and Safe Website Crawler
- **Goals:** Ingest leads via CSV and safely collect raw website data without network vulnerabilities.
- **Deliverables:**
  - [x] Entities & Repositories: `searches`, `leads`, `enrichments` (`LeadRepository`, `EnrichmentRepository`, `SearchRepository`).
  - [x] CSV parser with schema validation, header mapping, and CSV formula-injection sanitization (`=`, `@`, `+`, `-` escaping).
  - [x] Company domain normalization and per-organization deduplication.
  - [x] Multi-tenant CSV upload REST endpoint (`POST /v1/ingestion/csv`) and searches listing (`GET /v1/ingestion/searches`).
  - [x] Safe HTTP crawler using `httpx` and `beautifulsoup4` (`CrawlerService`):
    - [x] Strict SSRF protection: DNS pre-resolution blocking loopback (`127.0.0.0/8`, `::1`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and cloud metadata (`169.254.169.254`).
    - [x] Redirect safety validation (re-validates IP at each redirect hop).
    - [x] Hard execution timeouts and response size limits (2MB).
    - [x] Evidence provenance tracking (timestamp, URL, raw snippet, HTTP status, detected tech, CTAs).
  - [x] Provider operational modes supported: `mock`, `live`, `disabled`.
  - [x] Next.js interactive UI: CSV file upload with formula protection, sample template download, leads table with search/filtering, and crawl evidence preview drawer.
- **Verification:** Security unit tests against SSRF attempts. Automated CSV import tests for formula injection, deduplication, and cross-tenant isolation. All 33 tests passing.

---

### Phase 4: The 22-Signal Qualification Engine
- **Goals:** Implement all 22 deterministic signals, weighted scoring, and qualification bands.
- **Signal Catalog:**
  1. `legacy_platform` (CMS/tech stack detection)
  2. `slow_site` (page load & resource weight metrics)
  3. `old_design` (DOM structure, viewport, modern layout heuristics)
  4. `weak_ctas` (call-to-action button and form detection)
  5. `not_mobile_friendly` (responsive meta tags, media query heuristics)
  6. `no_ssl` (HTTPS enforcement & certificate validity)
  7. `thin_content` (word count, meaningful body text density)
  8. `no_analytics` (GA4, GTM, Plausible, PostHog, Segment detection)
  9. `accessibility` (automated WCAG checks: alt tags, aria attributes, heading hierarchy)
  10. `no_live_chat` (chat widget script & DOM detection)
  11. `poor_seo` (title, meta description, canonical, H1 hierarchy, OpenGraph)
  12. `poor_aeo_geo` (JSON-LD structured data, Schema.org Organization/LocalBusiness)
  13. `low_domain_trust` (domain age/TLD trust heuristics; no fake metrics)
  14. `stale_blog` (blog link presence, publication dates, freshness)
  15. `no_press` (press releases, media kit, newsroom pages)
  16. `no_case_studies` (customer testimonials, case study links)
  17. `no_video` (embedded YouTube, Vimeo, HTML5 video)
  18. `weak_social` (official LinkedIn, Twitter/X, GitHub links)
  19. `weak_email_capture` (newsletter forms, lead magnets)
  20. `ppc_spend` (Google Tag / Meta Pixel / Ads script presence)
  21. `hiring` (careers page, job board links, ATS detection)
  22. `low_review_rating` (legitimate review schema/links; explicit unavailable if missing)
- **Deliverables & Verification:**
  - [x] All 22 deterministic signal evaluators implemented and verified without LLM dependency.
  - [x] Category grouping: Website Signals (1-10) and Marketing Signals (11-22).
  - [x] Configurable tenant ICP thresholds and custom weights via `EngineRepository` (`GET/PUT /v1/scoring/config`).
  - [x] Missing data handling: missing signals do not penalize scores.
  - [x] Ideal Customer Profile (+10 pts) bonus logic with minimum coverage requirements.
  - [x] Score persistence to PostgreSQL `scores` table with full explainable JSON breakdown and configuration snapshots.
  - [x] Lead evaluation endpoint (`POST /v1/leads/{lead_id}/score`) and score history endpoint (`GET /v1/leads/{lead_id}/scores`).
  - [x] Next.js interactive UI: real-time scoring trigger, qualification badges, ICP criteria control, and 22-signal explainable modal breakdown.
  - [x] All 36 automated unit, security, and integration tests passing cleanly.

---

### Phase 5: Job Orchestration
- **Goals:** Asynchronous background job processing with ARQ and Redis.
- **Deliverables:**
  - Entities: `runs`, `usage_ledger`.
  - ARQ background worker pipeline: crawl -> enrich -> score.
  - Checkpointing: job progress, stage transitions, and results persisted to PostgreSQL.
  - Per-tenant concurrency limits (default: 2 active runs per organization).
  - Circuit breaker and exponential backoff retry mechanisms.
  - Graceful cancellation handling.
- **Verification:** Test worker retry logic, failure handling, cancellation, and tenant queue isolation.

---

### Phase 6: Free Live Integrations Evaluation & Adapters
- **Goals:** Connect verified free providers where available, maintaining fallback to mock/disabled.
- **Process:** One provider at a time (e.g., Google PageSpeed Insights free tier, free OpenStreetMap/Nominatim, public company datasets).
- **Checkpoints:** Present free-tier terms, require user confirmation before enabling live mode.

---

### Phase 7: Human Approval and AI Outreach
- **Goals:** Review pipeline, human gates, contact reveal protection, and deterministic/AI outreach drafting.
- **Deliverables:**
  - Entities: `contacts`, `drafts`.
  - Pipeline state machine: `new` -> `enriching` -> `review` -> `qualified` -> `rejected` -> `approved` -> `drafted` -> `synced`.
  - Explicit human approval gate for contact reveal (PII masking until approved).
  - Outreach draft generator:
    - Deterministic template engine (100% offline, zero-cost fallback).
    - Optional OpenAI-compatible / local Ollama adapter for AI-assisted personalization.
  - Draft review, editing, and approval workflow.
- **Verification:** State transition validations; verify contacts cannot be revealed without explicit approval; verify offline drafting works when no LLM is configured.

---

### Phase 8: CRM Integration (HubSpot)
- **Goals:** Synchronize approved leads to HubSpot CRM.
- **Deliverables:**
  - Entities: `crm_connections`, `crm_syncs`.
  - Provider interface: `CRMAdapter`.
  - HubSpot adapter supporting Free Developer / Private App credentials.
  - Idempotent upsert logic using remote IDs and domain deduplication.
  - Sync state recording with actual API payload responses.
  - CSV export remaining fully functional regardless of CRM status.
- **Checkpoint:** Detailed step-by-step guide for creating a free HubSpot developer test account. Wait for user credentials in `.env`.

---

### Phase 9: Production Hardening and Load Testing
- **Goals:** Reliability, security, rate limiting, and capacity validation for 1,000–1,500 tenant orgs.
- **Deliverables:**
  - FastAPI rate-limiting middleware (slowapi/Redis).
  - Security headers, CORS, CSRF protection.
  - Audit logging for all sensitive actions.
  - Locust / k6 load test script simulating multi-tenant concurrency and measuring API latency, database connections, and worker queue lag.
  - Backup and recovery procedures.

---

### Phase 10: Final Review and Documentation
- **Deliverables:**
  - Full architectural report, migration guides, API documentation, threat model review, free-tier limitations reference, and verified test suite execution.
