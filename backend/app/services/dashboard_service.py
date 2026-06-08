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
    PendingItem,
    RecentReport,
    RecentReviewTask,
    SystemStatus,
)
from app.services.llm import LLMService
from app.services.vector_store import VectorStore


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


class DashboardService:
    def __init__(self, db: Session, tenant_id: str | None = None):
        self.db = db
        # 租户隔离范围：member 为其 tenant_id；super_admin 传 None（不限）
        self.tenant_id = tenant_id

    def _count(self, model) -> int:
        return self.db.query(func.count(model.id)).scalar() or 0

    def _tenant_count(self, model) -> int:
        """对带 tenant_id 的私有表计数，按当前租户过滤。"""
        query = self.db.query(func.count(model.id))
        if self.tenant_id is not None:
            query = query.filter(model.tenant_id == self.tenant_id)
        return query.scalar() or 0

    def _expansion_source_count(self, *, exclude_assistant_deposits: bool = False) -> int:
        """扩展来源计数。

        侧边栏/看板里的「资料总数」应统计真实资料来源，不应把助手会话/附件沉淀出的
        practice_feedback 记录一并算进去，否则会出现“资料库几乎为空但资料数不为 0”的误导。
        """
        query = self.db.query(func.count(ExpansionSource.id))
        if self.tenant_id is not None:
            query = query.filter(ExpansionSource.tenant_id == self.tenant_id)
        if exclude_assistant_deposits:
            query = query.filter(
                ExpansionSource.meta["deposited_from"].as_string().is_(None)
            )
        return query.scalar() or 0

    def summary(
        self, core_store: VectorStore, llm: LLMService, embedding_provider: str
    ) -> DashboardSummary:
        pending_q = self.db.query(func.count(ReviewTask.id)).filter(
            ReviewTask.status == "pending"
        )
        if self.tenant_id is not None:
            pending_q = pending_q.filter(ReviewTask.tenant_id == self.tenant_id)
        pending = pending_q.scalar() or 0
        # 数据库连通性：能跑到这里即视为 ok
        status = SystemStatus(
            database="ok",
            qdrant="ok" if core_store.backend == "qdrant" else "offline_fallback",
            llm="ok" if llm.available else "offline_fallback",
            embedding="ok" if embedding_provider else "error",
        )
        return DashboardSummary(
            methodology_sources=self._count(MethodologySource),
            expansion_sources=self._expansion_source_count(
                exclude_assistant_deposits=True
            ),
            chunks=self._count(MethodologyChunk),
            nodes=self._count(MethodologyNode),
            edges=self._count(MethodologyEdge),
            routing_rules=self._count(ProblemRoutingRule),
            expansion_items=self._tenant_count(ExpansionItem),
            pending_reviews=pending,
            reports=self._tenant_count(DiagnosisReport),
            system_status=status,
        )

    def pending_items(self) -> list[PendingItem]:
        """跨域待办计数（始终返回固定 3 桶，便于前端稳定渲染）。

        - review : 待审核扩展条目（review_tasks.status == pending）
        - sources: 资料待处理（核心资料未建底座 uploaded/processed + 外部资料未吸收 uploaded）
        - reports: 报告待复核（diagnosis_reports.status != checked）
        """
        review_q = self.db.query(func.count(ReviewTask.id)).filter(
            ReviewTask.status == "pending"
        )
        expansion_q = self.db.query(func.count(ExpansionSource.id)).filter(
            ExpansionSource.status == "uploaded"
        )
        expansion_q = expansion_q.filter(
            ExpansionSource.meta["deposited_from"].as_string().is_(None)
        )
        reports_q = self.db.query(func.count(DiagnosisReport.id)).filter(
            DiagnosisReport.status != "checked"
        )
        if self.tenant_id is not None:
            review_q = review_q.filter(ReviewTask.tenant_id == self.tenant_id)
            expansion_q = expansion_q.filter(ExpansionSource.tenant_id == self.tenant_id)
            reports_q = reports_q.filter(DiagnosisReport.tenant_id == self.tenant_id)
        review_pending = review_q.scalar() or 0
        expansion_pending = expansion_q.scalar() or 0
        reports_pending = reports_q.scalar() or 0
        # 核心资料待处理为平台级（仅超管视角有意义），租户视角恒为 0
        core_pending = (
            0
            if self.tenant_id is not None
            else (
                self.db.query(func.count(MethodologySource.id))
                .filter(MethodologySource.status.in_(["uploaded", "processed"]))
                .scalar()
                or 0
            )
        )
        return [
            PendingItem(key="review", count=review_pending),
            PendingItem(key="sources", count=core_pending + expansion_pending),
            PendingItem(key="reports", count=reports_pending),
        ]

    def recent_reports(self, limit: int = 8) -> list[RecentReport]:
        query = self.db.query(DiagnosisReport)
        if self.tenant_id is not None:
            query = query.filter(DiagnosisReport.tenant_id == self.tenant_id)
        rows = query.order_by(DiagnosisReport.created_at.desc()).limit(limit).all()
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
        query = self.db.query(ReviewTask)
        if self.tenant_id is not None:
            query = query.filter(ReviewTask.tenant_id == self.tenant_id)
        rows = query.order_by(ReviewTask.created_at.desc()).limit(limit).all()
        return [
            RecentReviewTask(
                id=t.id,
                task_type=t.task_type,
                status=t.status,
                created_at=_iso(t.created_at),
            )
            for t in rows
        ]
