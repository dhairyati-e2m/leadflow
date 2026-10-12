# LeadFlow System Architecture

## 1. System Overview

LeadFlow is a multi-tenant B2B lead qualification and CRM synchronization platform architected as a **Modular Monolith** with separated background workers.

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend (Next.js 15 / React / Tailwind)"]
        UI["Web Dashboard & Review Queue"]
        AuthUI["Session & Org Switcher"]
    end

    subgraph ApiLayer["Backend API (FastAPI)"]
        Router["/v1 API Routers"]
        AuthMiddleware["JWT & RLS Session Context"]
        TenantRepo["Tenant-Scoped Repositories"]
        ScoringCore["22-Signal Scoring Engine (Deterministic)"]
        DraftEngine["Outreach Drafting (Template / LLM)"]
        CRMService["CRM Sync Service"]
    end

    subgraph WorkerLayer["Background Processing (ARQ / Python)"]
        Worker["ARQ Worker Pool"]
        Crawler["Safe Web Crawler (SSRF-Protected)"]
        Collector["Signal Collectors"]
    end

    subgraph DataLayer["Storage & Cache"]
        Postgres[(PostgreSQL 16\nRLS + JSONB Evidence + History)]
        RedisCache[(Redis 7\nARQ Queue + Deduplication)]
    end

    subgraph ExternalServices["External Providers (Free-Only / Adapters)"]
        TargetWebsites["Target Company Websites (Public HTML)"]
        PageSpeed["Google PageSpeed (Optional Free API)"]
        HubSpot["HubSpot CRM (Free App / OAuth)"]
        OllamaLocal["Local Ollama / OpenAI-Compatible (Optional)"]
    end

    UI -->|HTTPS / REST| Router
    Router --> AuthMiddleware
    AuthMiddleware --> TenantRepo
    TenantRepo --> Postgres
    Router -->|Enqueue Job| RedisCache
    Worker -->|Consume Task| RedisCache
    Worker --> Crawler
    Crawler --> TargetWebsites
    Worker --> Collector
    Collector --> ScoringCore
    Worker --> Postgres
    CRMService --> HubSpot
    DraftEngine --> OllamaLocal
```

---

## 2. Component Design

### 2.1 Backend (`backend/`)
- **FastAPI:** High-performance async web framework.
- **SQLAlchemy 2.x (Async):** Relational ORM handling data access, connection pooling, and tenant session variables.
- **Pydantic v2:** Request/response schemas, rigorous boundary validation.
- **Alembic:** Version-controlled database migrations.
- **ARQ:** Async Redis-backed job queue for distributed enrichment and crawling tasks.
- **Crawler Subsystem:** Built with `httpx` and `BeautifulSoup4`. Features custom DNS pre-resolution resolving hostnames before connection, rejecting all private, loopback, multicast, and link-local IP addresses (defense against SSRF).

### 2.2 Frontend (`frontend/`)
- **Next.js 15 (App Router):** Server-side rendered pages with client components for interactive queues.
- **Tailwind CSS & Component Primitives:** Clean, accessible SaaS dashboard with responsive design.
- **Strict Tenant Context:** Organization switching and role validation handled securely via HTTP-only session cookies.

### 2.3 Database & Queue
- **PostgreSQL 16:** The sole authoritative store for all tenant business data, scoring snapshots, lead states, and run checkpoints.
  - Row-Level Security (RLS) policies enforce tenant isolation on every table with `org_id`.
  - JSONB columns store raw signal evidence with full provenance (source URL, timestamps, confidence).
- **Redis 7:** Broker for ARQ background tasks, rate-limit counters, and ephemeral caching.

---

## 3. Data Flow & Lead Pipeline

```mermaid
stateDiagram-v2
    [*] --> new: CSV Import / Source
    new --> enriching: Enqueue Job
    enriching --> review: Crawl + 22 Signals Scored
    enriching --> failed: Fatal Worker Failure

    review --> qualified: Score >= Threshold (Auto/Manual)
    review --> rejected: Below ICP / Manual Reject
    review --> approved: Human Reviewer Approval

    qualified --> approved: Human Approval Gate
    approved --> drafted: Contact Revealed + Outreach Drafted
    drafted --> synced: HubSpot Sync / CSV Export
    synced --> [*]
    rejected --> [*]
```

### Key Security Gates:
1. **SSRF Guard:** No outbound crawler request touches private IP ranges or metadata servers (`169.254.169.254`).
2. **Contact Reveal Gate:** Contact email/phone details remain masked until a human user with appropriate permissions explicitly approves the lead.
3. **Outreach Gate:** Outreach drafts are generated for human review. No automated email sending occurs.
4. **CRM Sync Gate:** Leads are synchronized to HubSpot only after human approval of both the lead and the outreach draft.
