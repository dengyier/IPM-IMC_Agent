"""Phase 2 外部信息进化 Pydantic v2 schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ExtensionType = Literal[
    "customer_context_extensions",
    "case_extensions",
    "scenario_extensions",
    "external_view_extensions",
    "different_views",
    "practice_feedback",
]

ReviewStatus = Literal["pending", "approved", "rejected"]


# --------------------------------------------------------------------------- #
# Sources
# --------------------------------------------------------------------------- #


class ExpansionSourceOut(BaseModel):
    id: str
    title: str
    source_type: str
    url: str | None = None
    submitted_by: str | None = None
    source_layer: str
    visibility: str
    authority_level: int
    status: str
    meta: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadExpansionResult(BaseModel):
    source_id: str
    title: str
    status: str
    message: str = "已上传，请调用 /absorb 解析、吸收并生成审核任务。"


# --------------------------------------------------------------------------- #
# Items / review
# --------------------------------------------------------------------------- #


class ExpansionItemOut(BaseModel):
    id: str
    source_id: str
    chunk_id: str | None = None
    extension_type: str
    title: str
    content: str
    summary: str
    key_points: list[str]
    aligned_node_id: str | None = None
    alignment_score: float
    review_status: str
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewTaskOut(BaseModel):
    id: str
    item_id: str
    task_type: str
    status: str
    reviewer: str | None = None
    decision_comment: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}


class ReviewDecisionRequest(BaseModel):
    decision: ReviewStatus
    reviewer: str | None = None
    comment: str | None = None
    # 审核通过后是否立即触发节点版本演进
    evolve_on_approve: bool = True


class ReviewDecisionResult(BaseModel):
    task_id: str
    item_id: str
    status: str
    node_version_id: str | None = None
    message: str = ""


# --------------------------------------------------------------------------- #
# Node versions
# --------------------------------------------------------------------------- #


class KnowledgeNodeVersionOut(BaseModel):
    id: str
    node_id: str
    version: str
    change_type: str
    change_summary: str
    supplementary_context: str
    incorporated_item_ids: list[str]
    status: str
    created_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Graph run results
# --------------------------------------------------------------------------- #


class AbsorbExpansionResult(BaseModel):
    source_id: str
    status: str
    chunk_count: int
    embedded_count: int
    item_count: int
    review_task_count: int
    vector_backend: str
    trace: list[str] = Field(default_factory=list)


class EvolveNodeResult(BaseModel):
    node_id: str
    version: str
    incorporated_item_count: int
    node_version_id: str
    trace: list[str] = Field(default_factory=list)
