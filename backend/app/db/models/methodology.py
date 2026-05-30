"""Phase 1 — 方法论底座 (Methodology Kernel) 数据模型。

核心约束：
- 港大 IMC&IPM 核心方法论资料是系统的不可见思考内核：
  source_layer='imc_ipm_core'、visibility='internal_only'、authority_level=100。
- 前端不得展示核心方法论原始资料；这些表只供系统内部推理/诊断/吸收使用。
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JsonType, uid, utc_now


class MethodologySource(Base):
    """核心方法论原始资料来源（内部不可见）。"""

    __tablename__ = "methodology_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # courseware/transcript/case_material/business_canvas/lecture_note/assignment_comment/methodology_text
    source_type: Mapped[str] = mapped_column(String(60), nullable=False, default="courseware")
    file_path: Mapped[str | None] = mapped_column(String(500))
    course_session: Mapped[str | None] = mapped_column(String(120))
    source_layer: Mapped[str] = mapped_column(String(40), default="imc_ipm_core")
    visibility: Mapped[str] = mapped_column(String(40), default="internal_only")
    authority_level: Mapped[int] = mapped_column(Integer, default=100)
    # uploaded / processed / kernel_built
    status: Mapped[str] = mapped_column(String(40), default="uploaded")
    meta: Mapped[dict] = mapped_column(JsonType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    chunks: Mapped[list["MethodologyChunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class MethodologyChunk(Base):
    """核心方法论资料切块，向量写入 methodology_core_chunks（最高权重）。"""

    __tablename__ = "methodology_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("methodology_sources.id"), nullable=False
    )
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    topic: Mapped[str | None] = mapped_column(String(255))
    page_number: Mapped[int | None] = mapped_column(Integer)
    section_title: Mapped[str | None] = mapped_column(String(255))
    source_layer: Mapped[str] = mapped_column(String(40), default="imc_ipm_core")
    visibility: Mapped[str] = mapped_column(String(40), default="internal_only")
    authority_level: Mapped[int] = mapped_column(Integer, default=100)
    qdrant_point_id: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    source: Mapped[MethodologySource] = relationship(back_populates="chunks")


class MethodologyNode(Base):
    """核心方法论知识节点：定义 + 核心原则 + 思考路径 + 决策逻辑（内部不可见）。"""

    __tablename__ = "methodology_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    node_name: Mapped[str] = mapped_column(String(255), nullable=False)
    node_category: Mapped[str | None] = mapped_column(String(120))
    definition: Mapped[str] = mapped_column(Text, default="")
    core_principle: Mapped[str] = mapped_column(Text, default="")
    core_thinking: Mapped[str] = mapped_column(Text, default="")
    decision_logic: Mapped[list] = mapped_column(JsonType, default=list)
    key_questions: Mapped[list] = mapped_column(JsonType, default=list)
    common_mistakes: Mapped[list] = mapped_column(JsonType, default=list)
    applicable_scenarios: Mapped[list] = mapped_column(JsonType, default=list)
    source_chunk_ids: Mapped[list] = mapped_column(JsonType, default=list)
    status: Mapped[str] = mapped_column(String(40), default="active")
    visibility: Mapped[str] = mapped_column(String(40), default="internal_only")
    authority_level: Mapped[int] = mapped_column(Integer, default=100)
    version: Mapped[str] = mapped_column(String(20), default="v1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class MethodologyEdge(Base):
    """核心方法论节点关系边，构成知识网络图谱。"""

    __tablename__ = "methodology_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source_node_id: Mapped[str] = mapped_column(
        ForeignKey("methodology_nodes.id"), nullable=False
    )
    target_node_id: Mapped[str] = mapped_column(
        ForeignKey("methodology_nodes.id"), nullable=False
    )
    # prerequisite/supports/causes/constrains/validates/extends/contrasts/risk_trigger
    relation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    relation_description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    evidence_chunk_ids: Mapped[list] = mapped_column(JsonType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ProblemRoutingRule(Base):
    """问题意图 → 核心方法论节点的调用规则，供问题路由与诊断 Agent 使用。"""

    __tablename__ = "problem_routing_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    intent: Mapped[str] = mapped_column(String(120), nullable=False)
    intent_description: Mapped[str | None] = mapped_column(Text)
    trigger_keywords: Mapped[list] = mapped_column(JsonType, default=list)
    required_node_ids: Mapped[list] = mapped_column(JsonType, default=list)
    optional_node_ids: Mapped[list] = mapped_column(JsonType, default=list)
    canvas_modules: Mapped[list] = mapped_column(JsonType, default=list)
    routing_priority: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(40), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
