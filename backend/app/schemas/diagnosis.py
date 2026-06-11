"""Phase 3 商业画布诊断 Pydantic v2 schemas。"""

from datetime import datetime

from typing import Literal

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
    # basic：基础报告；standard：标准报告；consulting：咨询式深度报告
    report_depth: Literal["basic", "standard", "consulting"] = "consulting"
    # 9 模块画布输入：{module: 用户填写文本}
    canvas: dict[str, str] = Field(default_factory=dict)
    # 所属项目；不传则诊断时自动建项目兜底
    project_id: str | None = None
    # 任务包类型：new_project | sales_growth | ai_acquisition | review
    task_pack: str | None = None


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
    current_judgement: str = ""
    evidence_and_observations: list[str] = Field(default_factory=list)
    key_issues: list[str] = Field(default_factory=list)
    business_impact: str = ""
    hypotheses_to_validate: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    metrics_to_track: list[str] = Field(default_factory=list)
    methodology_basis: list[str] = Field(default_factory=list)
    confidence: float | None = None


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
    project_id: str | None = None
    title: str
    company_name: str | None = None
    question: str
    intent: str | None = None
    report_depth: str = "consulting"
    canvas_input: dict
    module_findings: dict
    executive_summary: dict = Field(default_factory=dict)
    core_tensions: list = Field(default_factory=list)
    cross_canvas_logic: list = Field(default_factory=list)
    decision_frame: dict = Field(default_factory=dict)
    decision_roles: list = Field(default_factory=list)
    scenario_paths: list = Field(default_factory=list)
    causal_chains: list = Field(default_factory=list)
    unit_economics: dict = Field(default_factory=dict)
    risk_matrix: list = Field(default_factory=list)
    tianji_risk_audit: list = Field(default_factory=list)
    mvp_validation_path: list = Field(default_factory=list)
    validation_plan: list = Field(default_factory=list)
    contradictions: list = Field(default_factory=list)
    assumption_status: list = Field(default_factory=list)
    roles_degraded: bool = False
    role_similarity_max: float = 0.0
    debate_rounds: list = Field(default_factory=list)
    consensus: list = Field(default_factory=list)
    disagreements: list = Field(default_factory=list)
    ninety_day_plan: dict = Field(default_factory=dict)
    final_recommendation: dict = Field(default_factory=dict)
    archive_candidates: list = Field(default_factory=list)
    algorithm_version: str | None = None
    tianji_deposited_source_id: str | None = None
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


class ReportDepositSimulationResponse(BaseModel):
    """报告天机推演资产沉淀结果（候选池 + 人工审核）。"""

    report_id: str
    source_id: str
    title: str
    status: str
    item_count: int = 0
    review_task_count: int = 0
    message: str
