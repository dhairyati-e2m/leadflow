from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.domain.scoring import ScoringEngineConfig
from backend.app.models.entities import EngineParam, ScoringEngine
from backend.app.repositories.base import TenantScopedRepository


class EngineRepository(TenantScopedRepository[ScoringEngine]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(ScoringEngine, session, org_id)

    async def get_active_engine(self) -> Optional[ScoringEngine]:
        stmt = (
            select(ScoringEngine)
            .options(selectinload(ScoringEngine.params))
            .where(
                ScoringEngine.org_id == self.org_id,
                ScoringEngine.is_active.is_(True),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_or_create_config(self) -> ScoringEngineConfig:
        engine = await self.get_active_engine()
        if not engine:
            # Create default scoring engine for this tenant
            engine = ScoringEngine(
                org_id=self.org_id,
                name="Default ICP Qualification Engine",
                version="1.0.0",
                is_active=True,
            )
            self.session.add(engine)
            await self.session.flush()

            # Store default configuration params
            default_config = ScoringEngineConfig()
            param = EngineParam(
                engine_id=engine.id,
                param_key="scoring_config",
                param_value=default_config.model_dump(),
            )
            self.session.add(param)
            await self.session.flush()
            return default_config

        # Find scoring_config param
        for p in engine.params:
            if p.param_key == "scoring_config":
                return ScoringEngineConfig(**p.param_value)

        # Fallback to default
        return ScoringEngineConfig()

    async def update_config(self, new_config: ScoringEngineConfig) -> ScoringEngineConfig:
        engine = await self.get_active_engine()
        if not engine:
            engine = ScoringEngine(
                org_id=self.org_id,
                name="Default ICP Qualification Engine",
                version=new_config.version,
                is_active=True,
            )
            self.session.add(engine)
            await self.session.flush()

            param = EngineParam(
                engine_id=engine.id,
                param_key="scoring_config",
                param_value=new_config.model_dump(),
            )
            self.session.add(param)
            await self.session.flush()
            return new_config

        # Update existing param
        updated = False
        for p in engine.params:
            if p.param_key == "scoring_config":
                p.param_value = new_config.model_dump()
                updated = True
                break

        if not updated:
            param = EngineParam(
                engine_id=engine.id,
                param_key="scoring_config",
                param_value=new_config.model_dump(),
            )
            self.session.add(param)

        await self.session.flush()
        return new_config
