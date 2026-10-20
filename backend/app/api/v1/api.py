from fastapi import APIRouter
from backend.app.api.v1.endpoints import (
    access_requests,
    admin,
    audiences,
    auth,
    health,
    hubspot,
    ingestion,
    integrations,
    jobs,
    leads,
    notifications,
    orgs,
    scoring,
    workspace_requests,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(access_requests.router, prefix="/orgs/access-requests", tags=["Access Requests"])
api_router.include_router(orgs.router, prefix="/orgs", tags=["Organizations"])
api_router.include_router(workspace_requests.router, prefix="/workspaces/requests", tags=["Workspace Requests"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(audiences.router, prefix="/audiences", tags=["ICP Audiences"])
api_router.include_router(ingestion.router, prefix="/ingestion", tags=["Ingestion"])
api_router.include_router(leads.router, prefix="/leads", tags=["Leads"])
api_router.include_router(scoring.router, prefix="/scoring", tags=["Scoring Engine"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Job Orchestration"])
api_router.include_router(integrations.router, prefix="/settings/integrations", tags=["Integration Controls"])
api_router.include_router(hubspot.router, prefix="/settings/integrations/hubspot", tags=["HubSpot Integration"])
api_router.include_router(hubspot.router, prefix="/crm/hubspot", tags=["HubSpot Integration Alias"], include_in_schema=False)
api_router.include_router(admin.router, prefix="/admin", tags=["Super Admin & Audit"])



