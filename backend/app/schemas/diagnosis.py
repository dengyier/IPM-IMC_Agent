"""Phase 3 商业画布诊断 Pydantic v2 schemas。"""

from datetime import datetime

from pydantic import BaseModel, Field

# 商业模式画布 9 模块
CANVAS_MODULES = [
    "customer_segments",
    "value_propositions",
    "channels",
    "customer_relationships",
    "revenue_streams",
    "key_resources",
    "key_activities",
    "key_partners",
    "cost_structure",
]


# --------------------------------------------------------------------------- #
# Request
# --------------------------------------------------------------------------- #


class DiagnoseRequest(BaseModel):
    title: str
    question: str = ""
    company_name: str | None = None
    # 9 模块画布输入：{module: 用户填写文本}
    canvas: dict[str, str] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Routing / fusion (internal, exposed in trace only)
# --------------------------------------------------------------------------- #


class RoutingDecision(BaseModel):
    intent: str
    intent_description: str | None = None
    matched_score: int
    required_node_ids: list[str] = Field(default_factory=list)
    optional_node_ids: list[str] = Field(default_factory=list)
    canvas_modules: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Module findings
# --------------------------------------------------------------------------- #


class ModuleFinding(BaseModel):
    assessment: str = ""
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #


class QualityCheckOut(BaseModel):
    id: str
    report_id: str
    overall_score: float
    dimension_scores: dict
    passed: bool
    issues: list[str]
    suggestions: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class DiagnosisReportOut(BaseModel):
    id: str
    title: str
    company_name: str | None = None
    question: str
    intent: str | None = None
    canvas_input: dict
    module_findings: dict
    key_assumptions: list[str]
    risks: list[str]
    recommended_actions: list[str]
    evidence_refs: list
    methodology_node_ids: list[str]
    overall_summary: str
    quality_score: float
    status: str
    used_llm: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiagnoseResult(BaseModel):
    report: DiagnosisReportOut
    routing: RoutingDecision
    quality: QualityCheckOut
    used_llm: bool
    trace: list[str] = Field(default_factory=list)
