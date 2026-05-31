"""Dashboard 聚合响应 schema（语义数据，样式由前端映射）。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SystemStatus(BaseModel):
    database: str = "ok"
    qdrant: str = "ok"
    llm: str = "ok"
    embedding: str = "ok"


class DashboardSummary(BaseModel):
    # 核心计数（纯数字，前端负责千分位/单位）
    methodology_sources: int = 0
    expansion_sources: int = 0
    chunks: int = 0
    nodes: int = 0
    edges: int = 0
    routing_rules: int = 0
    expansion_items: int = 0
    pending_reviews: int = 0
    reports: int = 0
    system_status: SystemStatus = Field(default_factory=SystemStatus)


class RecentReport(BaseModel):
    id: str
    title: str
    created_at: str | None = None
    quality_score: float = 0.0
    status: str = "draft"


class RecentReviewTask(BaseModel):
    id: str
    task_type: str
    status: str
    created_at: str | None = None
