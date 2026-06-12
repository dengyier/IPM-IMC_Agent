"""Tianji-BACH v2 case snapshot schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TianjiBachHypothesisOut(BaseModel):
    id: str
    statement: str
    dimension: str
    falsified_by: str = ""
    validated_by: str = ""
    prior_logodds: float
    current_logodds: float
    probability: float
    # 敏感性分析后的有效权重（决定性假设提升为 1.0）
    impact_weight: float
    # 创建时的结构权重（不被敏感性分析覆盖）
    structural_weight: float = 0.5
    # 该假设的 P 置 0/1 会翻转裁决结论
    decisive: bool = False
    status: str


class TianjiBachEvidenceOut(BaseModel):
    id: str
    hypothesis_id: str
    content: str
    source_type: str
    source_ref: str = ""
    grade: str
    log_lr_raw: float
    log_lr_effective: float
    reviewer_spread: float = 0.0
    review_detail: dict = Field(default_factory=dict)
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class TianjiBachPredictionOut(BaseModel):
    id: str
    verdict: str
    probability: float
    probability_raw: float
    kill_criteria: list[dict] = Field(default_factory=list)
    outcome: float | None = None
    brier: float | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}


class TianjiBachAdjudicationOut(BaseModel):
    probability: float
    verdict: str
    vetoed_by: str | None = None
    reasons: list[str] = Field(default_factory=list)
    kill_criteria: list[dict] = Field(default_factory=list)


class TianjiSandboxTornadoItem(BaseModel):
    param: str
    label: str
    p_at_min: float
    p_at_max: float
    swing: float


class TianjiSandboxResult(BaseModel):
    available: bool
    missing: list[str] = Field(default_factory=list)
    investment: float | None = None
    target_months: int | None = None
    simulations: int = 0
    params: dict = Field(default_factory=dict)
    p_payback: float | None = None
    loss_probability: float | None = None
    payback_p50: int | None = None
    payback_p90: int | None = None
    tornado: list[TianjiSandboxTornadoItem] = Field(default_factory=list)
    generated_at: str | None = None


class TianjiBachCaseOut(BaseModel):
    case_id: str
    algorithm_version: str = "tianji-bach.v2"
    adjudication: TianjiBachAdjudicationOut | None = None
    hypotheses: list[TianjiBachHypothesisOut] = Field(default_factory=list)
    evidence: list[TianjiBachEvidenceOut] = Field(default_factory=list)
    predictions: list[TianjiBachPredictionOut] = Field(default_factory=list)
    replay_logodds: dict[str, float] = Field(default_factory=dict)
    replay_consistent: bool = True
    sandbox: TianjiSandboxResult | None = None
