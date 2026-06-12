"""决策病例库聚合 schemas。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DecisionCaseAsset(BaseModel):
    label: str
    kind: str


class DecisionCaseOut(BaseModel):
    id: str
    project_id: str | None = None
    validation_card_id: str
    title: str
    industry: str | None = None
    decision: str
    evidence_grade: str = "D"
    planned_investment: str = ""
    saved_investment_estimate: str = ""
    biggest_uncertainty: str = ""
    final_outcome: str = ""
    key_learning: str = ""
    failure_patterns: list[str] = Field(default_factory=list)
    assets: list[DecisionCaseAsset] = Field(default_factory=list)
    reviewed_at: datetime | None = None
