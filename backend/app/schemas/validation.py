"""验证卡 schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ValidationStatus = Literal["draft", "running", "completed", "archived"]
ValidationResult = Literal["achieved", "not_achieved", "partially_achieved"]


class ValidationAction(BaseModel):
    title: str
    objective: str
    steps: list[str] = Field(default_factory=list)
    success_metric: str
    owner: str | None = None
    day_range: str = "1-7天"


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
