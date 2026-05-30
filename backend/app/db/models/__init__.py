"""聚合所有 ORM 模型，确保它们注册到 Base.metadata。"""

from app.db.models.common import AgentRun
from app.db.models.diagnosis import DiagnosisReport, ReportQualityCheck
from app.db.models.expansion import (
    ExpansionChunk,
    ExpansionItem,
    ExpansionSource,
    KnowledgeNodeVersion,
    ReviewTask,
)
from app.db.models.methodology import (
    MethodologyChunk,
    MethodologyEdge,
    MethodologyNode,
    MethodologySource,
    ProblemRoutingRule,
)

__all__ = [
    "AgentRun",
    "MethodologyChunk",
    "MethodologyEdge",
    "MethodologyNode",
    "MethodologySource",
    "ProblemRoutingRule",
    "ExpansionChunk",
    "ExpansionItem",
    "ExpansionSource",
    "KnowledgeNodeVersion",
    "ReviewTask",
    "DiagnosisReport",
    "ReportQualityCheck",
]
