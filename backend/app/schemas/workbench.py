"""验证工作台聚合视图 schemas。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class WorkbenchProject(BaseModel):
    id: str | None = None
    name: str
    industry: str | None = None
    current_problem: str = ""
    target_customer: str = ""
    task_pack: str = "new_project"
    status: str = "idea"
    planned_investment: str | None = None
    decision_deadline: str | None = None
    updated_at: datetime | None = None


class WorkbenchTimelineItem(BaseModel):
    day: int
    label: str
    status: str


class WorkbenchAction(BaseModel):
    node_id: str = ""
    parent_id: str | None = None
    node_type: str = "action"
    branch_condition: str = ""
    title: str
    objective: str = ""
    success_metric: str = ""
    grounded_on: str = ""
    target: str = ""
    baseline: str = ""
    owner: str | None = None
    day_range: str = "1-7天"
    status: str = "todo"
    progress: int = 0
    evidence_count: int = 0
    evidence_target: int = 3
    missing_evidence_count: int = 0
    evidence_grade: str = "C"
    dependencies: list[str] = Field(default_factory=list)
    unlocks: list[str] = Field(default_factory=list)
    failure_branch: str | None = None
    parallelizable: bool = False
    priority_score: int = 50
    kill_if_failed: bool = False
    evidence_items: list[dict] = Field(default_factory=list)

    @field_validator("parent_id", mode="before")
    @classmethod
    def normalize_parent_id(cls, value):
        if value is None or value == "":
            return None
        return str(value)


class WorkbenchColdReview(BaseModel):
    verdict: str
    confidence: int
    reasons: list[str] = Field(default_factory=list)
    risk_level: str = "medium"


class WorkbenchEvidenceStatus(BaseModel):
    existing: int = 0
    missing: int = 0
    pending: int = 0
    grade: str = "D"


class WorkbenchCaseAsset(BaseModel):
    label: str
    status: str = "pending"


class WorkbenchBachHypothesis(BaseModel):
    id: str
    statement: str
    dimension: str
    probability: float
    impact_weight: float
    status: str


class WorkbenchBachSnapshot(BaseModel):
    verdict: str = ""
    probability: int = 0
    kill_criteria: list[dict] = Field(default_factory=list)
    hypotheses: list[WorkbenchBachHypothesis] = Field(default_factory=list)
    replay_consistent: bool = True


class WorkbenchWorldModel(BaseModel):
    player_role: str = "未设定"
    main_quest: str = "尚未生成主线任务"
    resource_gaps: list[str] = Field(default_factory=list)
    active_rules: list[str] = Field(default_factory=list)
    risk_signals: list[str] = Field(default_factory=list)
    next_quests: list[str] = Field(default_factory=list)


class WorkbenchSummary(BaseModel):
    has_data: bool
    current_project: WorkbenchProject | None = None
    current_card_id: str | None = None
    current_day: int = 0
    total_days: int = 7
    final_decision: str = "未决"
    next_action: str = ""
    evidence_updated_at: datetime | None = None
    timeline: list[WorkbenchTimelineItem] = Field(default_factory=list)
    actions: list[WorkbenchAction] = Field(default_factory=list)
    cold_review: WorkbenchColdReview
    evidence_status: WorkbenchEvidenceStatus
    case_assets: list[WorkbenchCaseAsset] = Field(default_factory=list)
    bach: WorkbenchBachSnapshot | None = None
    world_model: WorkbenchWorldModel = Field(default_factory=WorkbenchWorldModel)
