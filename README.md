# LeadFlow — Multi-Tenant AI Lead Qualification & CRM Platform

LeadFlow is a production-oriented SaaS platform that discovers potential B2B customers, enriches company data, evaluates companies against a configurable Ideal Customer Profile (ICP), calculates explainable qualification scores using 22 signals, allows human review & approval, generates personalized outreach drafts, and synchronizes approved prospects to HubSpot.

---

## Key Features

- **Multi-Tenant Isolation:** Complete organization isolation backed by PostgreSQL Row-Level Security (RLS) policies.
- **22-Signal Deterministic Engine:** Mathematical scoring (0–100) across 10 Website Signals and 12 Marketing Signals with explicit missing-data semantics.
- **Safe Web Crawler:** Built-in SSRF protection blocking loopback, link-local, private ranges, and cloud metadata (`169.254.169.254`).
- **Human-in-the-Loop Workflow:** Mandatory approval gates for contact reveals, outreach drafts, and CRM sync.
- **Zero-Cost Local Development:** Fully functional offline using CSV import, deterministic scoring, local templates, and mock adapters.
- **Provider Adapter Architecture:** Strict operational modes (`mock`, `live`, `disabled`) with clear provenance tracking.

---

## Repository Structure

```
leadflow/
├── backend/                  # FastAPI modular monolith, SQLAlchemy, Alembic, ARQ
│   ├── app/
│   │   ├── api/              # Versioned API routes (/v1)
│   │   ├── core/             # Configuration, security, database session, RLS
│   │   ├── domain/           # 22-signal evaluators, scoring engine, crawler, CSV
│   │   ├── models/           # SQLAlchemy ORM models (17 entities)
│   │   ├── repositories/     # Tenant-scoped data repositories
│   │   └── workers/          # ARQ background worker tasks
│   ├── alembic/              # Database migration scripts
│   ├── requirements.txt      # Pinned backend dependencies
│   └── tests/                # Pytest unit, integration, and security test suites
├── frontend/                 # Next.js 15, React, TypeScript, Tailwind CSS
│   ├── src/
│   │   ├── app/              # App router pages (Dashboard, Review Queue, etc.)
│   │   └── lib/              # API client, auth context, utilities
│   └── package.json
├── docker/                   # Database provisioning scripts
│   └── init-db.sql           # Creates non-superuser role and RLS test DB
├── docs/                     # Architecture, decisions, plans, security, free-tier specs
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── FREE_TIER_LIMITATIONS.md
│   └── IMPLEMENTATION_PLAN.md
├── .env.example              # Documented environment variable templates
├── .gitignore                # Secret protection rules
├── docker-compose.yml        # Local PostgreSQL 16 & Redis 7 services
└── README.md
```

---

## Windows PowerShell Development Guide

### 1. Backend Testing (Runs Offline Without Docker)

To run the automated test suite in Windows PowerShell:

```powershell
# Safe direct execution without modifying system execution policy:
.\.venv\Scripts\python.exe -m pytest -v
```

This runs all 22-signal evaluator tests, CSV formula-injection protection tests, crawler SSRF tests, and API health probes. Real PostgreSQL and Redis tests are marked as pending/skipped when live services are unconfigured.

### 2. Starting the Backend API Server

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Interactive API Docs (Swagger):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Liveness Probe:** [http://127.0.0.1:8000/v1/health](http://127.0.0.1:8000/v1/health)
- **Readiness Probe:** [http://127.0.0.1:8000/v1/ready](http://127.0.0.1:8000/v1/ready)

### 3. Starting the Frontend (Next.js 15)

```powershell
cd frontend
cmd /c "npm run dev"
```

Access the dashboard at [http://localhost:3000](http://localhost:3000).

### 4. Running Migrations (When PostgreSQL is Available)

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

---

## Documentation Quick Links

- [System Architecture](file:///docs/ARCHITECTURE.md)
- [Architecture Decision Log (ADR)](file:///docs/DECISIONS.md)
- [Free-Tier & Open-Source Compliance Matrix](file:///docs/FREE_TIER_LIMITATIONS.md)
- [Phase Implementation Roadmap](file:///docs/IMPLEMENTATION_PLAN.md)
