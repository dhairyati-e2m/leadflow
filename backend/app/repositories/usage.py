from datetime import datetime, timezone
from typing import Dict, List, Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import UsageLedger
from backend.app.repositories.base import TenantScopedRepository


class UsageLedgerRepository(TenantScopedRepository[UsageLedger]):
    def __init__(self, session: AsyncSession, org_id: str):
        super().__init__(UsageLedger, session, org_id)

    async def record_usage(
        self,
        metric: str,
        quantity: int = 1,
        period: Optional[str] = None,
    ) -> UsageLedger:
        month_str = period or datetime.now(timezone.utc).strftime("%Y-%m")
        entry = UsageLedger(
            org_id=self.org_id,
            metric=metric,
            quantity=quantity,
            month_period=month_str,
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def get_monthly_summary(self, period: Optional[str] = None) -> Dict[str, int]:
        month_str = period or datetime.now(timezone.utc).strftime("%Y-%m")
        stmt = (
            select(
                UsageLedger.metric,
                func.sum(UsageLedger.quantity).label("total_quantity"),
            )
            .where(
                UsageLedger.org_id == self.org_id,
                UsageLedger.month_period == month_str,
            )
            .group_by(UsageLedger.metric)
        )
        result = await self.session.execute(stmt)
        return {row.metric: int(row.total_quantity) for row in result.all()}
