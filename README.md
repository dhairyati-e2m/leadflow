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
│   │   ├── domain/           # 22-signal evaluators, scoring engine, state machines
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── providers/        # Adapters (Crawler, HubSpot, LLM, PageSpeed)
│   │   ├── repositories/     # Tenant-scoped data repositories
│   │   └── workers/          # ARQ background worker tasks
│   └── tests/                # Pytest unit, integration, and security test suites
├── frontend/                 # Next.js 15, React, TypeScript, Tailwind CSS
│   ├── src/
│   │   ├── app/              # App router pages (Auth, Dashboard, Review Queue, etc.)
│   │   ├── components/       # Accessible UI components & signal breakdowns
│   │   └── lib/              # API client, auth context, utilities
├── docs/                     # Architecture, decisions, plans, security, free-tier specs
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── FREE_TIER_LIMITATIONS.md
│   └── IMPLEMENTATION_PLAN.md
├── .env.example              # Documented environment variable templates
├── .gitignore                # Secret protection rules
└── README.md
```

---

## Development Prerequisites

- **Python:** 3.12+ (Installed: Python 3.12.6)
- **Node.js:** 20+ (Installed: Node.js 24.21.0, npm 11.19.0)
- **Git:** Installed (Git 2.56.0)
- **Database & Queue:** PostgreSQL 16 & Redis 7 (via Docker Desktop or native Windows services)

---

## Documentation Quick Links

- [System Architecture](file:///docs/ARCHITECTURE.md)
- [Architecture Decision Log (ADR)](file:///docs/DECISIONS.md)
- [Free-Tier & Open-Source Compliance Matrix](file:///docs/FREE_TIER_LIMITATIONS.md)
- [Phase Implementation Roadmap](file:///docs/IMPLEMENTATION_PLAN.md)
