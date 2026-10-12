from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Enrichment
from backend.app.repositories.base import TenantScopedRepository


class EnrichmentRepository(TenantScopedRepository[Enrichment]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(Enrichment, session, org_id)

    async def get_latest_for_lead(self, lead_id: str) -> Optional[Enrichment]:
        stmt = (
            select(Enrichment)
            .where(
                Enrichment.org_id == self.org_id,
                Enrichment.lead_id == lead_id,
            )
            .order_by(Enrichment.observed_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_for_lead(self, lead_id: str, limit: int = 10) -> List[Enrichment]:
        stmt = (
            select(Enrichment)
            .where(
                Enrichment.org_id == self.org_id,
                Enrichment.lead_id == lead_id,
            )
            .order_by(Enrichment.observed_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_enrichment(
        self,
        lead_id: str,
        provider: str,
        status: str,
        crawled_url: str,
        evidence: Dict[str, Any],
    ) -> Enrichment:
        enrichment = Enrichment(
            org_id=self.org_id,
            lead_id=lead_id,
            provider=provider,
            status=status,
            crawled_url=crawled_url,
            evidence=evidence,
            observed_at=datetime.now(timezone.utc),
        )
        self.session.add(enrichment)
        await self.session.flush()
        return enrichment
