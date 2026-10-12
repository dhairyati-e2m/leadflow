from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Score
from backend.app.repositories.base import TenantScopedRepository


class ScoreRepository(TenantScopedRepository[Score]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(Score, session, org_id)

    async def get_latest_for_lead(self, lead_id: str) -> Optional[Score]:
        stmt = (
            select(Score)
            .where(
                Score.org_id == self.org_id,
                Score.lead_id == lead_id,
            )
            .order_by(Score.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_for_lead(self, lead_id: str, limit: int = 10) -> List[Score]:
        stmt = (
            select(Score)
            .where(
                Score.org_id == self.org_id,
                Score.lead_id == lead_id,
            )
            .order_by(Score.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_score(
        self,
        lead_id: str,
        engine_version: str,
        final_score: float,
        qualification_band: str,
        website_group_score: float,
        marketing_group_score: float,
        ideal_client_bonus_applied: bool,
        signal_breakdown: Dict[str, Any],
        config_snapshot: Dict[str, Any],
    ) -> Score:
        score = Score(
            org_id=self.org_id,
            lead_id=lead_id,
            engine_version=engine_version,
            final_score=final_score,
            qualification_band=qualification_band,
            website_group_score=website_group_score,
            marketing_group_score=marketing_group_score,
            ideal_client_bonus_applied=ideal_client_bonus_applied,
            signal_breakdown=signal_breakdown,
            config_snapshot=config_snapshot,
        )
        self.session.add(score)
        await self.session.flush()
        return score
