from fastapi import APIRouter
from backend.app.api.v1.endpoints import health, leads, scoring

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(scoring.router, prefix="/scoring", tags=["Scoring Engine"])
api_router.include_router(leads.router, prefix="/leads", tags=["Leads Ingestion"])
