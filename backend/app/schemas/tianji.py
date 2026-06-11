"""天机推演算法结构化输出。

这些 schema 是后端内部编排与前端展示之间的契约。所有字段都应是可展示的
消化后判断，不承载核心课件原文。
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TianjiDecisionFrame(BaseModel):
    decision_objective: str = ""
    business_context: str = ""
    target_customer: str = ""
    current_problem: str = ""
    constraints: list[str] = Field(default_factory=list)
    unknown_assumptions: list[str] = Field(default_factory=list)
    expected_output: str = ""


class TianjiEvidenceRef(BaseModel):
    type: str
    ref: str
    node_id: str | None = None
    summary: str = ""
    score: float | None = None


class TianjiDecisionRole(BaseModel):
    role: str
    lens: str
    key_question: str
    likely_position: str
    evidence_focus: list[str] = Field(default_factory=list)


class TianjiScenarioPath(BaseModel):
    name: str
    path_type: str
    description: str
    triggers: list[str] = Field(default_factory=list)
    leading_indicators: list[str] = Field(default_factory=list)
    decision_implication: str = ""
    probability: str = "medium"


class TianjiCausalChain(BaseModel):
    chain: str
    explanation: str
    affected_modules: list[str] = Field(default_factory=list)
    leverage_point: str = ""


class TianjiRiskAuditItem(BaseModel):
    risk: str
    severity: str = "medium"
    probability: str = "medium"
    early_signal: str = ""
    mitigation: str = ""


class TianjiValidationStep(BaseModel):
    step: str
    objective: str
    action: str
    success_criteria: str
    duration: str = "7天内"


class TianjiAssumptionStatus(BaseModel):
    assumption: str
    status: str = "unknown"
    evidence: str = ""


class TianjiDebatePosition(BaseModel):
    role: str
    updated_position: str = ""
    conflicts_with: list[str] = Field(default_factory=list)


class TianjiDebateRound(BaseModel):
    round_index: int
    positions: list[TianjiDebatePosition] = Field(default_factory=list)
    converged: bool = False


class TianjiSimulationResult(BaseModel):
    algorithm_version: str = "tianji-mps.v1"
    mode: str = "chat"
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = 0.65
    decision_frame: TianjiDecisionFrame = Field(default_factory=TianjiDecisionFrame)
    evidence_refs: list[TianjiEvidenceRef] = Field(default_factory=list)
    decision_roles: list[TianjiDecisionRole] = Field(default_factory=list)
    scenario_paths: list[TianjiScenarioPath] = Field(default_factory=list)
    causal_chains: list[TianjiCausalChain] = Field(default_factory=list)
    risk_audit: list[TianjiRiskAuditItem] = Field(default_factory=list)
    validation_plan: list[TianjiValidationStep] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    assumption_status: list[TianjiAssumptionStatus] = Field(default_factory=list)
    roles_degraded: bool = False
    role_similarity_max: float = 0.0
    debate_rounds: list[TianjiDebateRound] = Field(default_factory=list)
    consensus: list[str] = Field(default_factory=list)
    disagreements: list[str] = Field(default_factory=list)
    archive_candidates: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    used_llm: bool = False
