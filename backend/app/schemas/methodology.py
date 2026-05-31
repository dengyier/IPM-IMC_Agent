"""方法论底座 Pydantic v2 schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RelationType = Literal[
    "prerequisite",
    "supports",
    "causes",
    "constrains",
    "validates",
    "extends",
    "contrasts",
    "risk_trigger",
]


# --------------------------------------------------------------------------- #
# Sources
# --------------------------------------------------------------------------- #


class MethodologySourceOut(BaseModel):
    id: str
    title: str
    source_type: str
    course_session: str | None = None
    source_layer: str
    visibility: str
    authority_level: int
    status: str
    meta: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadSourceResult(BaseModel):
    source_id: str
    title: str
    status: str
    message: str = "已上传，请调用 /process 解析并写入核心向量库。"


# --------------------------------------------------------------------------- #
# Node extraction candidate (LLM / 本地回退共用)
# --------------------------------------------------------------------------- #


class RelatedNodeRef(BaseModel):
    target: str  # 以 node_name 引用，构建边时解析为 id
    relation_type: RelationType = "supports"
    description: str = ""


class MethodologyNodeCandidate(BaseModel):
    node_name: str
    node_category: str | None = None
    definition: str = ""
    core_principle: str = ""
    core_thinking: str = ""
    decision_logic: list[str] = Field(default_factory=list)
    key_questions: list[str] = Field(default_factory=list)
    common_mistakes: list[str] = Field(default_factory=list)
    applicable_scenarios: list[str] = Field(default_factory=list)
    related_nodes: list[RelatedNodeRef] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #


class MethodologyNodeOut(BaseModel):
    id: str
    node_name: str
    node_category: str | None = None
    definition: str
    core_principle: str
    core_thinking: str
    decision_logic: list[str]
    key_questions: list[str]
    common_mistakes: list[str]
    applicable_scenarios: list[str]
    source_chunk_ids: list[str]
    status: str
    visibility: str
    authority_level: int
    version: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MethodologyEdgeOut(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    relation_type: str
    relation_description: str | None = None
    weight: float

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# 知识节点库视图（卡片 / 分类 / 子资源）
# --------------------------------------------------------------------------- #


class NodeCardOut(BaseModel):
    """节点列表卡片：语义字段 + 计数；样式与展示串由前端拼。"""

    id: str
    node_name: str
    node_category: str | None = None
    definition: str = ""  # 已截断的摘要
    status: str
    version: str
    edge_count: int = 0
    expansion_count: int = 0
    source_chunk_count: int = 0


class PaginatedNodes(BaseModel):
    items: list[NodeCardOut]
    total: int
    page: int = 1
    page_size: int = 20


class NodeCategoryCount(BaseModel):
    label: str
    count: int


class NodeEdgeOut(BaseModel):
    """以某节点为中心的关系边（含邻居名称与方向）。"""

    id: str
    relation_type: str
    relation_description: str | None = None
    weight: float
    direction: Literal["outgoing", "incoming"]
    neighbor_id: str
    neighbor_name: str


class NodeVersionOut(BaseModel):
    id: str
    version: str
    change_type: str
    change_summary: str = ""
    supplementary_context: str = ""
    incorporated_item_ids: list[str] = Field(default_factory=list)
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NodeExpansionOut(BaseModel):
    """对齐到该节点的外部扩展条目（外部内容，非核心原文）。"""

    id: str
    extension_type: str
    title: str = ""
    summary: str = ""
    alignment_score: float = 0.0
    review_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProblemRoutingRuleOut(BaseModel):
    id: str
    intent: str
    intent_description: str | None = None
    trigger_keywords: list[str]
    required_node_ids: list[str]
    optional_node_ids: list[str]
    canvas_modules: list[str]
    routing_priority: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Graph run results
# --------------------------------------------------------------------------- #


class ProcessSourceResult(BaseModel):
    source_id: str
    status: str
    chunk_count: int
    embedded_count: int
    vector_backend: str
    trace: list[str] = Field(default_factory=list)


class BuildKernelResult(BaseModel):
    source_id: str
    status: str
    node_count: int
    edge_count: int
    used_llm: bool
    trace: list[str] = Field(default_factory=list)


class GenerateRoutingRulesResult(BaseModel):
    rule_count: int
    rules: list[ProblemRoutingRuleOut]
