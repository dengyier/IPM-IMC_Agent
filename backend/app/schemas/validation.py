"""验证卡 schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ValidationStatus = Literal["draft", "running", "completed", "archived"]
ValidationResult = Literal["achieved", "not_achieved", "partially_achieved"]
ValidationActionStatus = Literal["todo", "running", "done", "blocked"]
ValidationFinalDecision = Literal["continue", "adjust", "pause"]
ValidationEvidenceGrade = Literal["A", "B", "C", "D"]
ValidationEvidenceSourceType = Literal[
    "user_interview",
    "customer_feedback",
    "paid_intent",
    "channel_quote",
    "cost_estimate",
    "market_data",
    "expert_opinion",
    "document",
    "other",
]


class ValidationEvidenceItem(BaseModel):
    text: str
    grade: ValidationEvidenceGrade | None = None
    source_type: ValidationEvidenceSourceType | None = None
    attachment_url: str | None = None
    attachment_name: str | None = None
    created_at: str | None = None


class ValidationAction(BaseModel):
    node_id: str = ""
    parent_id: str | None = None
    node_type: str = "action"
    branch_condition: str = ""
    title: str
    objective: str
    steps: list[str] = Field(default_factory=list)
    success_metric: str
    grounded_on: str = ""
    target: str = ""
    baseline: str = ""
    owner: str | None = None
    day_range: str = "1-7天"
    day: int | None = Field(default=None, ge=0, le=7)
    status: ValidationActionStatus = "todo"
    progress: int = Field(default=0, ge=0, le=100)
    evidence_count: int = Field(default=0, ge=0)
    evidence_target: int = Field(default=3, ge=1)
    evidence_grade: ValidationEvidenceGrade = "C"
    dependencies: list[str] = Field(default_factory=list)
    unlocks: list[str] = Field(default_factory=list)
    failure_branch: str | None = None
    parallelizable: bool = False
    priority_score: int = Field(default=50, ge=0, le=100)
    kill_if_failed: bool = False
    evidence_items: list[ValidationEvidenceItem] = Field(default_factory=list)
    due_at: datetime | None = None
    completed_at: datetime | None = None


class ValidationActionPatch(BaseModel):
    status: ValidationActionStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    evidence_count: int | None = Field(default=None, ge=0)
    evidence_target: int | None = Field(default=None, ge=1)
    evidence_note: str | None = Field(default=None, max_length=2000)
    evidence_item: ValidationEvidenceItem | None = None
    owner: str | None = None
    due_at: datetime | None = None
    completed_at: datetime | None = None


class ValidationDecisionCriteria(BaseModel):
    continue_when: str
    adjust_when: str
    pause_when: str


class ValidationCardCreate(BaseModel):
    project_id: str | None = None
    conversation_id: str | None = None
    source_message_id: str | None = None
    title: str | None = Field(default=None, max_length=255)
    project_description: str | None = None
    target_customer: str | None = None


class ValidationCardUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    status: ValidationStatus | None = None
    actions: list[ValidationAction] | None = None
    decision_criteria: ValidationDecisionCriteria | None = None
    result: ValidationResult | None = None
    actual_outcome: str | None = None
    learnings: str | None = None
    validated_at: datetime | None = None


class ValidationReviewSubmit(BaseModel):
    final_decision: ValidationFinalDecision
    interview_count: int = Field(default=0, ge=0)
    paid_intent_count: int = Field(default=0, ge=0)
    rejection_reasons: list[str] = Field(default_factory=list)
    channel_quotes: list[str] = Field(default_factory=list)
    estimated_cac: str = ""
    actual_outcome: str = ""
    learnings: str = ""


class ValidationCardOut(BaseModel):
    id: str
    tenant_id: str | None = None
    user_id: str | None = None
    project_id: str | None = None
    conversation_id: str | None = None
    source_message_id: str | None = None
    title: str
    project_summary: str = ""
    core_judgment: str = ""
    biggest_uncertainty: str = ""
    target_customer: str = ""
    failure_reason: str = ""
    actions: list[ValidationAction] = Field(default_factory=list)
    decision_criteria: ValidationDecisionCriteria | dict = Field(default_factory=dict)
    result: ValidationResult | None = None
    actual_outcome: str = ""
    learnings: str = ""
    validated_at: datetime | None = None
    node_refs: list[dict] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
