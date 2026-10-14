from fastapi import APIRouter
from backend.app.api.v1.endpoints import admin, audiences, auth, health, ingestion, integrations, jobs, leads, orgs, scoring

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(orgs.router, prefix="/orgs", tags=["Organizations"])
api_router.include_router(audiences.router, prefix="/audiences", tags=["ICP Audiences"])
api_router.include_router(ingestion.router, prefix="/ingestion", tags=["Ingestion"])
api_router.include_router(leads.router, prefix="/leads", tags=["Leads"])
api_router.include_router(scoring.router, prefix="/scoring", tags=["Scoring Engine"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Job Orchestration"])
api_router.include_router(integrations.router, prefix="/settings/integrations", tags=["Integration Controls"])
api_router.include_router(admin.router, prefix="/admin", tags=["Super Admin & Audit"])


