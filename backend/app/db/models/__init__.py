"""聚合所有 ORM 模型，确保它们注册到 Base.metadata。"""

from app.db.models.common import AgentRun, Task
from app.db.models.assistant import AssistantConversation, AssistantMessage
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
from app.db.models.system import SystemSettings

__all__ = [
    "AgentRun",
    "Task",
    "AssistantConversation",
    "AssistantMessage",
    "SystemSettings",
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
