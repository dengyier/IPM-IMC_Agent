"""Dashboard 聚合路由（工作台首页态势）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    get_app_settings,
    get_core_store,
    get_current_user,
    get_llm,
    tenant_scope,
)
from app.core.config import Settings
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.dashboard import (
    DashboardSummary,
    PendingItem,
    RecentReport,
    RecentReviewTask,
    TianjiMetrics,
)
from app.services.dashboard_service import DashboardService
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(
    db: Session = Depends(get_db),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
    settings: Settings = Depends(get_app_settings),
    user: AuthUser = Depends(get_current_user),
) -> DashboardSummary:
    return DashboardService(db, tenant_scope(user)).summary(
        core_store=core_store,
        llm=llm,
        embedding_provider=settings.embedding_provider,
    )


@router.get("/pending-items", response_model=list[PendingItem])
def pending_items(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[PendingItem]:
    return DashboardService(db, tenant_scope(user)).pending_items()


@router.get("/recent-reports", response_model=list[RecentReport])
def recent_reports(
    limit: int = 8,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[RecentReport]:
    return DashboardService(db, tenant_scope(user)).recent_reports(limit=limit)


@router.get("/recent-review-tasks", response_model=list[RecentReviewTask])
def recent_review_tasks(
    limit: int = 8,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[RecentReviewTask]:
    return DashboardService(db, tenant_scope(user)).recent_review_tasks(limit=limit)


@router.get("/tianji-metrics", response_model=TianjiMetrics)
def tianji_metrics(
    days: int = 30,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> TianjiMetrics:
    return DashboardService(db, tenant_scope(user)).tianji_metrics(days=days)
