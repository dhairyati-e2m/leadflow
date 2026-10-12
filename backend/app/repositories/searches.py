from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Search
from backend.app.repositories.base import TenantScopedRepository


class SearchRepository(TenantScopedRepository[Search]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(Search, session, org_id)

    async def create_search(
        self,
        name: str,
        source_type: str = "csv",
        total_leads: int = 0,
        metadata_json: Optional[Dict[str, Any]] = None,
    ) -> Search:
        search = Search(
            org_id=self.org_id,
            name=name,
            source_type=source_type,
            status="completed",
            total_leads=total_leads,
            metadata_json=metadata_json or {},
        )
        self.session.add(search)
        await self.session.flush()
        return search

    async def list_searches(self, limit: int = 20, offset: int = 0) -> List[Search]:
        stmt = (
            select(Search)
            .where(Search.org_id == self.org_id)
            .order_by(Search.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
