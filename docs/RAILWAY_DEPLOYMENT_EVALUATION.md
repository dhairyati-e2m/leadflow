# Railway Hosting and Deployment Readiness Evaluation

This document evaluates **Railway** as a potential cloud deployment platform for LeadFlow in accordance with **Mandatory Rule A (Free services only)** and Section 9 of the Phase 6 specification.

---

## 1. Executive Summary & Cost Reality

> **Critical Cost Finding**: Railway does **NOT** offer a permanent free hosting tier.
> - **Trial Credit**: New accounts receive a **$5 one-time credit** that expires after **30 days**.
> - **Ongoing Cost**: Once the trial credit expires, continuous execution requires upgrading to the **Hobby Plan** ($5/month base fee + usage charges).
> - **Rule A Compliance**: Because LeadFlow must strictly adhere to zero-cost, free-only software, deploying continuously on Railway would incur recurring monthly charges. Therefore, **local Docker Compose remains our primary 100% free production-grade baseline**, while the application is engineered to remain completely cloud-portable.

---

## 2. Railway Architecture & Service Topology

To run LeadFlow in production on Railway, the following 5 service components are required:

```
[ Public Internet ]
        |
        v
+-------------------+      Internal Private Network      +--------------------+
| Next.js Frontend  | ---------------------------------> |  FastAPI Backend   |
| (Node.js Service) |                                    |  (Python Service)  |
+-------------------+                                    +--------------------+
                                                            /        |       \
                                                           v         v        v
                                                    [ Postgres ]  [ Redis ] [ ARQ Worker ]
```

1. **Frontend Service**: Next.js 15 standalone server (Node.js runtime).
2. **Backend API Service**: FastAPI running under Uvicorn.
3. **Database Service**: Railway Managed PostgreSQL 16 plugin with persistent volume.
4. **Queue & Cache Service**: Railway Managed Redis 7 plugin.
5. **Background Worker Service**: ARQ worker process (`arq backend.app.workers.worker.WorkerSettings`).

---

## 3. Cost Implications Under Moderate Workload (50–100 Concurrent Users)

Railway bills based on vCPU and RAM usage per minute, plus the base plan fee:

| Service Component | Estimated Resources | Unit Pricing Rate | Estimated Monthly Cost |
|---|---|---|---|
| **Hobby Plan Base Fee** | Required for persistent uptime | $5.00 / month | $5.00 |
| **FastAPI Backend (API)** | 0.5 vCPU, 512 MB RAM | $0.000231 / GB-hr RAM + $0.000463 / vCPU-hr | ~$2.80 |
| **Next.js Frontend (UI)** | 0.25 vCPU, 256 MB RAM | $0.000231 / GB-hr RAM + $0.000463 / vCPU-hr | ~$1.40 |
| **ARQ Background Worker** | 0.5 vCPU, 512 MB RAM | $0.000231 / GB-hr RAM + $0.000463 / vCPU-hr | ~$2.80 |
| **PostgreSQL 16 Plugin** | 10 GB SSD, 512 MB RAM | $0.15 / GB storage + compute | ~$3.50 |
| **Redis 7 Plugin** | 128 MB RAM | Compute | ~$0.90 |
| **Total Estimated Cost** | — | — | **~$16.40 / month** |

---

## 4. Technical Feasibility & Deployment Features

### 4.1 Networking & Internal Service Discovery
- Railway provides private IPv6 DNS networking (`service-name.railway.internal`).
- The backend, database, and Redis communicate over low-latency private networks without exposing internal ports to the public internet.

### 4.2 Environment Variables & Secret Management
- Secrets (`SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `GOOGLE_PAGESPEED_API_KEY`) can be injected via Railway environment variable dashboard or CLI.
- No secrets need to be committed to the repository.

### 4.3 Health Checks & Restarts
- Railway supports HTTP health checks (`/v1/health` for backend, `/` for frontend).
- Automatic restart policies recover crashed worker or API containers.

### 4.4 Persistent Storage & Backups
- Railway PostgreSQL volumes provide persistent disk storage with automated daily backups.

---

## 5. Free Alternative Hosting Platforms

If cloud deployment is required without recurring costs:

| Alternative | Free Tier Allowance | Limitations |
|---|---|---|
| **Local Docker Compose** (Current) | **100% Free, Unlimited** | Runs on owner's machine. Zero cloud cost. |
| **Render.com (Free Tier)** | 750 free instance hours / month for web service + 90-day free PostgreSQL | Free database expires after 90 days; free web services spin down after 15 minutes of inactivity (cold starts ~50s). |
| **Fly.io** | $0 allowance with legacy free tier, now requires credit card for trial | Pay-as-you-go with credit card required. |
| **Self-Hosted VPS (Oracle Cloud Free Tier)** | 2 free AMD Compute VMs or 4-core 24GB ARM VM forever | Requires credit card verification upon signup, but provides genuine perpetual free cloud compute. |

---

## 6. Recommendation

1. **Do NOT enable Railway billing or deploy live instances** without explicit owner authorization (Rule A).
2. Maintain Docker Compose and standard container packaging so LeadFlow can be deployed to Railway, Render, Oracle Cloud Free Tier, or any Docker-compatible host at any time with zero code modifications.
