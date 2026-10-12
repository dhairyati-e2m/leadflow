# Architecture Decision Log (ADR) — LeadFlow

This document records the architectural and engineering decisions made throughout the lifecycle of the LeadFlow platform, along with the context, alternatives considered, and rationale.

---

## ADR-001: Modular Monolith Repository Structure

- **Status:** Proposed (Phase 0)
- **Date:** 2026-10-12
- **Context:** The application requires a Next.js (TypeScript) frontend and a Python (FastAPI/SQLAlchemy/ARQ) backend. Building separate microservices for every feature violates the project specification and introduces high operational complexity for a target of 1,000–1,500 customer organizations.
- **Alternatives Considered:**
  1. *Polyrepo (separate Git repositories):* Harder to coordinate schema migrations, unified testing, and end-to-end type validation.
  2. *Full monorepo toolchain (Turborepo/Nx):* High initial configuration overhead across Python and Node.js runtimes.
  3. *Modular Monolith (`backend/`, `frontend/`, `docs/`):* Clean separation of concerns, single version-controlled repository, simple CI/CD pipelines, and shared documentation.
- **Decision:** Adopt a **Modular Monolith** organized into `backend/` (FastAPI, Pydantic, SQLAlchemy, Alembic, ARQ worker) and `frontend/` (Next.js 15, React 19, TypeScript, Tailwind CSS), alongside comprehensive documentation in `docs/`.
- **Consequences:** Backend and frontend maintain isolated package definitions (`requirements.txt`/`pyproject.toml` and `package.json`), yet can be built, tested, and containerized predictably.

---

## ADR-002: Local Development Database and Queue Strategy

- **Status:** Proposed (Phase 0)
- **Date:** 2026-10-12
- **Context:** Docker is currently **not installed** on the host system. The application strictly requires PostgreSQL (with Row-Level Security) and Redis (for ARQ task orchestration).
- **Alternatives Considered:**
  1. *Require User to Install Docker Desktop / WSL2:* Allows standard `docker-compose up` for PostgreSQL 16 and Redis 7. Cleanest alignment with production-like infrastructure.
  2. *Install Native Windows PostgreSQL and Redis:* Native Windows services for Postgres and Redis (or Memurai/Redis-for-Windows). Works without virtualization overhead, but requires manual Windows installer runs.
  3. *Cloud Free-Tier PostgreSQL (Neon/Supabase) and Redis (Upstash):* No local service needed, but introduces network latency, external account dependency, and violates local offline development requirement.
  4. *SQLite/In-Memory fallback for unit tests + Docker/Native Postgres for integration/RLS tests:* Unit tests can run deterministically anywhere, but PostgreSQL RLS testing strictly requires a real PostgreSQL database with non-superuser roles.
- **Decision:** Present the choice to the user during Phase 0:
  - **Option A (Recommended):** User installs Docker Desktop (with WSL2 backend), allowing one-command Docker Compose for PostgreSQL 16 and Redis 7.
  - **Option B:** User installs native PostgreSQL and Redis for Windows, configured via `.env`.
  - In either case, the local test suite will provide a dual-mode fixture: deterministic in-memory/SQLite mocking for fast signal evaluator unit tests, and real PostgreSQL fixtures for tenant isolation and RLS security tests.
- **Consequences:** We will wait for user confirmation before executing Phase 1 database provisioning.

---

## ADR-003: Deterministic 22-Signal Scoring Engine (No LLM in Core Scoring)

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-12
- **Context:** Machine learning or LLM-based scoring is non-deterministic, prone to hallucination, expensive, and opaque. LeadFlow requires reproducible, explainable scoring normalized across 22 stable signal keys.
- **Alternatives Considered:**
  1. *Prompting an LLM to assign scores (0-100) based on crawled text:* Rejected due to high variance, latency, risk of prompt injection from untrusted crawled HTML, cost, and lack of mathematical rigor.
  2. *Pure Deterministic Rule-Based Evaluators:* Every signal produces an explicit schema: `signal_key`, `available`, `raw_value`, `normalized_score`, `weight`, `evidence`, `source`, `confidence`, `observed_at`, and `error_code`.
- **Decision:** The core 22-signal evaluation engine is 100% deterministic code. LLM functionality is strictly restricted to optional, post-scoring tasks (generating natural-language outreach drafts and explanatory summaries) behind human approval gates.
- **Consequences:** Scoring functions are fast, completely offline-capable, 100% testable via unit tests, and impervious to crawled prompt injections.

---

## ADR-004: Provider Adapter Pattern with Explicit Execution Modes

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-12
- **Context:** LeadFlow interacts with external data sources (crawlers, search engines, enrichment providers, CRM). Fake integrations or silent fallbacks violate Rule D.
- **Alternatives Considered:**
  1. *Hardcoded vendor SDKs:* Binds business logic to specific providers, making testing and swapping impossible.
  2. *Polymorphic Provider Adapters with Mode Flags (`mock`, `live`, `disabled`):* Each integration defines an interface (protocol/abstract class). The active mode is explicitly configured via environment variables and exposed transparently in the UI.
- **Decision:** Implement strict provider interfaces with explicit operational modes:
  - `mock`: Deterministic local fixture data for testing without network requests. Clearly tagged in logs and UI as synthetic.
  - `live`: Real API calls via verified free quotas.
  - `disabled`: Provider inactive; system handles missing signals gracefully without failing the entire lead pipeline.
- **Consequences:** The application runs end-to-end locally with zero external API keys out of the box.

---

## ADR-005: Multi-Tenant Isolation and Security Architecture

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-12
- **Context:** LeadFlow must support 1,000–1,500 customer organizations with strict data isolation.
- **Alternatives Considered:**
  1. *Application-level `WHERE org_id = :org_id` only:* Vulnerable to developer error or SQL query bugs leaking cross-tenant records.
  2. *Database-per-tenant:* Unmanageable connection pooling and migration overhead for 1,500 organizations.
  3. *Shared Database with Row-Level Security (RLS) + Tenant-Scoped Repositories:* PostgreSQL RLS enforces tenant boundaries at the database engine level via `SET LOCAL app.current_org_id`, complemented by SQLAlchemy tenant-scoped queries.
- **Decision:** Use a shared PostgreSQL database with `org_id` foreign keys, PostgreSQL Row-Level Security policies tested with a non-superuser role, and tenant-scoped repository wrappers in the application layer.
- **Consequences:** Multi-layered defense-in-depth preventing accidental data leakage across organizations.

---

## ADR-006: Decoupled Docker-Independent Development & Testing Strategy

- **Status:** Accepted (Phase 1)
- **Date:** 2026-10-12
- **Context:** Host machine virtualization (Windows Virtual Machine Platform) is currently unavailable, postponing Docker Desktop. Development must continue without stalling architectural progress, while maintaining strict adherence to PostgreSQL 16 and Redis 7 as production requirements.
- **Alternatives Considered:**
  1. *Halt progress until Windows virtualization is resolved:* Unnecessary blocker that stalls domain modeling, scoring algorithms, crawlers, and API scaffolding.
  2. *Replace PostgreSQL with SQLite in production code:* Violates Rule D and project requirements; SQLite lacks PostgreSQL JSONB operators, concurrency locking, and native Row-Level Security (RLS).
  3. *Decoupled Architecture with Mock/In-Memory Test Adapters:* Retain PostgreSQL 16 schemas, Alembic migrations, and SQLAlchemy async models as primary. Implement repository interfaces with tenant isolation. Use in-memory data structures / SQLite strictly for local unit test execution of domain logic, while clearly flagging PostgreSQL RLS and Redis ARQ integration tests as pending until real infrastructure is connected.
- **Decision:** Adopt Alternative 3. All domain models, Alembic migrations, and SQL schemas remain 100% PostgreSQL-native. Unit tests (scoring, crawler, CSV, schemas, validation) run completely offline without Docker. Integration tests requiring live PostgreSQL/Redis are gated by explicit connection checks and marked as skipped/pending when unconfigured.
- **Consequences:** Zero blocked progress. Complete fidelity to production PostgreSQL schema without premature dependency on local Docker containers.

