from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.domain.ingestion.csv_parser import ParsedLeadRow
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

    async def get_by_id_with_relations(self, lead_id: str) -> Optional[Lead]:
        stmt = (
            select(Lead)
            .options(selectinload(Lead.enrichments), selectinload(Lead.scores))
            .where(Lead.id == lead_id, Lead.org_id == self.org_id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def bulk_create_leads(
        self,
        parsed_rows: List[ParsedLeadRow],
        search_id: Optional[str] = None,
    ) -> Tuple[int, int, List[Lead]]:
        """
        Inserts new unique leads for this organization while safely deduplicating against existing domain records.
        Returns: (imported_count, duplicate_count, created_leads_list)
        """
        if not parsed_rows:
            return 0, 0, []

        incoming_domains = [row.domain.lower() for row in parsed_rows]

        # Check existing domains for this tenant
        existing_stmt = select(Lead.domain).where(
            Lead.org_id == self.org_id,
            Lead.domain.in_(incoming_domains),
        )
        existing_res = await self.session.execute(existing_stmt)
        existing_domain_set = set(existing_res.scalars().all())

        created_leads: List[Lead] = []
        duplicate_count = 0

        # Also track domains seen within this current batch to prevent intra-batch duplicates
        seen_in_batch = set()

        for row in parsed_rows:
            domain = row.domain.lower()
            if domain in existing_domain_set or domain in seen_in_batch:
                duplicate_count += 1
                continue

            seen_in_batch.add(domain)
            lead = Lead(
                org_id=self.org_id,
                search_id=search_id,
                company_name=row.company_name,
                domain=domain,
                industry=row.industry,
                location=row.location,
                employee_count=row.employee_count,
                pipeline_state="new",
                raw_data=row.raw_data,
            )
            self.session.add(lead)
            created_leads.append(lead)

        await self.session.flush()
        return len(created_leads), duplicate_count, created_leads

    async def list_paginated(
        self,
        pipeline_state: Optional[str] = None,
        search_query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Lead], int]:
        """
        Returns a paginated list of leads and total matching count, strictly scoped to self.org_id.
        """
        filters = [Lead.org_id == self.org_id]

        if pipeline_state:
            filters.append(Lead.pipeline_state == pipeline_state)

        if search_query:
            term = f"%{search_query.strip().lower()}%"
            filters.append(
                or_(
                    func.lower(Lead.company_name).like(term),
                    func.lower(Lead.domain).like(term),
                )
            )

        # Count total matching rows
        count_stmt = select(func.count(Lead.id)).where(*filters)
        total_res = await self.session.execute(count_stmt)
        total_count = total_res.scalar() or 0

        # Fetch items for page
        items_stmt = (
            select(Lead)
            .where(*filters)
            .order_by(Lead.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items_res = await self.session.execute(items_stmt)
        items = list(items_res.scalars().all())

        return items, total_count

    async def update_pipeline_state(self, lead_id: str, new_state: str) -> Optional[Lead]:
        lead = await self.get_by_id(lead_id)
        if not lead:
            return None
        lead.pipeline_state = new_state
        await self.session.flush()
        return lead

