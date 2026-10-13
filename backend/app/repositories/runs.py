from typing import Any, Dict, List, Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Run
from backend.app.repositories.base import TenantScopedRepository


class RunRepository(TenantScopedRepository[Run]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(Run, session, org_id)

    async def create_run(
        self,
        run_type: str = "enrich_and_score",
        total_items: int = 0,
        search_id: Optional[str] = None,
        checkpoint_data: Optional[Dict[str, Any]] = None,
    ) -> Run:
        run = Run(
            org_id=self.org_id,
            search_id=search_id,
            run_type=run_type,
            status="pending",
            total_items=total_items,
            processed_items=0,
            failed_items=0,
            checkpoint_data=checkpoint_data or {},
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def update_progress(
        self,
        run_id: str,
        processed_inc: int = 1,
        failed_inc: int = 0,
        checkpoint_data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Run]:
        run = await self.get_by_id(run_id)
        if not run:
            return None

        run.processed_items += processed_inc
        run.failed_items += failed_inc
        if checkpoint_data:
            current_checkpoint = dict(run.checkpoint_data or {})
            current_checkpoint.update(checkpoint_data)
            run.checkpoint_data = current_checkpoint

        await self.session.flush()
        return run

    async def set_status(
        self,
        run_id: str,
        status: str,
        error_message: Optional[str] = None,
        checkpoint_data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Run]:
        run = await self.get_by_id(run_id)
        if not run:
            return None

        run.status = status
        if error_message is not None:
            run.error_message = error_message
        if checkpoint_data:
            current_checkpoint = dict(run.checkpoint_data or {})
            current_checkpoint.update(checkpoint_data)
            run.checkpoint_data = current_checkpoint

        await self.session.flush()
        return run

    async def list_runs(self, limit: int = 20, offset: int = 0) -> List[Run]:
        stmt = (
            select(Run)
            .where(Run.org_id == self.org_id)
            .order_by(Run.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
