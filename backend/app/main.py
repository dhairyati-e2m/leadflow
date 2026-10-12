from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.v1.api import api_router
from backend.app.core.config import settings


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="Multi-Tenant AI Lead Qualification & CRM Platform",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS configuration allowing frontend origin
    origins = [settings.FRONTEND_URL, "http://127.0.0.1:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount versioned API router
    app.include_router(api_router, prefix="/v1")

    @app.get("/", tags=["Root"])
    async def root():
        return {
            "name": settings.APP_NAME,
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/v1/health",
        }

    return app


app = create_application()
