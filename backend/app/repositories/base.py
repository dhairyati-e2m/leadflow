from typing import Any, Generic, List, Optional, Type, TypeVar
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)


class TenantScopedRepository(Generic[ModelType]):
    """
    Base repository enforcing organization tenant isolation at the application query level.
    Guarantees all queries are scoped to org_id.
    """

    def __init__(self, model: Type[ModelType], session: AsyncSession, org_id: str):
        self.model = model
        self.session = session
        self.org_id = org_id

    async def get_by_id(self, item_id: str) -> Optional[ModelType]:
        stmt = select(self.model).where(
            self.model.id == item_id,
            self.model.org_id == self.org_id,
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_all(self, limit: int = 100, offset: int = 0) -> List[ModelType]:
        stmt = (
            select(self.model)
            .where(self.model.org_id == self.org_id)
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelType:
        # Enforce current tenant's org_id
        kwargs["org_id"] = self.org_id
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def delete_by_id(self, item_id: str) -> bool:
        stmt = delete(self.model).where(
            self.model.id == item_id,
            self.model.org_id == self.org_id,
        )
        result = await self.session.execute(stmt)
        return result.rowcount > 0
