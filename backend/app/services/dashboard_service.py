"""Dashboard 聚合服务：跨表计数 + 最近列表 + 系统状态。"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    DiagnosisReport,
    ExpansionItem,
    ExpansionSource,
    MethodologyChunk,
    MethodologyEdge,
    MethodologyNode,
    MethodologySource,
    ProblemRoutingRule,
    ReviewTask,
)
from app.schemas.dashboard import (
    DashboardSummary,
    RecentReport,
    RecentReviewTask,
    SystemStatus,
)
from app.services.llm import LLMService
from app.services.vector_store import VectorStore


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _count(self, model) -> int:
        return self.db.query(func.count(model.id)).scalar() or 0

    def summary(
        self, core_store: VectorStore, llm: LLMService, embedding_provider: str
    ) -> DashboardSummary:
        pending = (
            self.db.query(func.count(ReviewTask.id))
            .filter(ReviewTask.status == "pending")
            .scalar()
            or 0
        )
        # 数据库连通性：能跑到这里即视为 ok
        status = SystemStatus(
            database="ok",
            qdrant="ok" if core_store.backend == "qdrant" else "offline_fallback",
            llm="ok" if llm.available else "offline_fallback",
            embedding="ok" if embedding_provider else "error",
        )
        return DashboardSummary(
            methodology_sources=self._count(MethodologySource),
            expansion_sources=self._count(ExpansionSource),
            chunks=self._count(MethodologyChunk),
            nodes=self._count(MethodologyNode),
            edges=self._count(MethodologyEdge),
            routing_rules=self._count(ProblemRoutingRule),
            expansion_items=self._count(ExpansionItem),
            pending_reviews=pending,
            reports=self._count(DiagnosisReport),
            system_status=status,
        )

    def recent_reports(self, limit: int = 8) -> list[RecentReport]:
        rows = (
            self.db.query(DiagnosisReport)
            .order_by(DiagnosisReport.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            RecentReport(
                id=r.id,
                title=r.title,
                created_at=_iso(r.created_at),
                quality_score=r.quality_score or 0.0,
                status=r.status,
            )
            for r in rows
        ]

    def recent_review_tasks(self, limit: int = 8) -> list[RecentReviewTask]:
        rows = (
            self.db.query(ReviewTask)
            .order_by(ReviewTask.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            RecentReviewTask(
                id=t.id,
                task_type=t.task_type,
                status=t.status,
                created_at=_iso(t.created_at),
            )
            for t in rows
        ]
