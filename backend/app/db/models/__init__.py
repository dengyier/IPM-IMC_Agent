"""聚合所有 ORM 模型，确保它们注册到 Base.metadata。"""

from app.db.models.common import AgentRun, Task
from app.db.models.auth import AuthSession, AuthUser, SmsVerificationCode
from app.db.models.assistant import (
    AssistantConversation,
    AssistantFile,
    AssistantFileChunk,
    AssistantMessage,
)
from app.db.models.diagnosis import DiagnosisReport, ReportQualityCheck
from app.db.models.feedback import Feedback
from app.db.models.project import Project
from app.db.models.validation import ValidationCard
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
from app.db.models.tenant import Tenant
from app.db.models.tianji import TianjiEvidenceRecord, TianjiHypothesis, TianjiPrediction

__all__ = [
    "Tenant",
    "AgentRun",
    "Task",
    "AuthUser",
    "AuthSession",
    "SmsVerificationCode",
    "AssistantConversation",
    "AssistantMessage",
    "AssistantFile",
    "AssistantFileChunk",
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
    "Feedback",
    "Project",
    "ValidationCard",
    "TianjiHypothesis",
    "TianjiEvidenceRecord",
    "TianjiPrediction",
]
