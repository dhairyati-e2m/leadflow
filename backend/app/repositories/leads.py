from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Lead
from backend.app.repositories.base import TenantScopedRepository


class LeadRepository(TenantScopedRepository[Lead]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(Lead, session, org_id)

    async def get_by_domain(self, domain: str) -> Optional[Lead]:
        stmt = select(Lead).where(
            Lead.org_id == self.org_id,
            Lead.domain == domain.lower(),
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_by_pipeline_state(
        self, state: str, limit: int = 100, offset: int = 0
    ) -> List[Lead]:
        stmt = (
            select(Lead)
            .where(
                Lead.org_id == self.org_id,
                Lead.pipeline_state == state,
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_score_band(
        self, band: str, limit: int = 100, offset: int = 0
    ) -> List[Lead]:
        stmt = (
            select(Lead)
            .where(
                Lead.org_id == self.org_id,
                Lead.score_band == band,
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
