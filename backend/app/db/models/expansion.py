"""Phase 2 — 外部信息进化 (External Info Evolution) 数据模型。

核心约束：
- 外部信息（同学笔记/案例/外部观点/实践反馈等）不能覆盖核心方法论字段，
  只能进入扩展层；source_layer='expansion'，写入 expansion_chunks 向量库。
- 所有外部扩展进入正式知识网络（节点版本）前，必须经过人工审核（review_tasks）。
- 未审核内容不得作为正式诊断结论依据、不得进入正式知识节点版本、不得覆盖核心字段。

扩展层 6 类 extension_type：
    customer_context_extensions / case_extensions / scenario_extensions /
    external_view_extensions / different_views / practice_feedback
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JsonType, uid, utc_now


class ExpansionSource(Base):
    """外部扩展资料来源（同学笔记 / 案例 / 文章 / 实践反馈）。"""

    __tablename__ = "expansion_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # classmate_note / case / article / external_view / practice_feedback / scenario
    source_type: Mapped[str] = mapped_column(String(60), nullable=False, default="classmate_note")
    file_path: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(500))
    submitted_by: Mapped[str | None] = mapped_column(String(120))
    source_layer: Mapped[str] = mapped_column(String(40), default="expansion")
    visibility: Mapped[str] = mapped_column(String(40), default="team")
    authority_level: Mapped[int] = mapped_column(Integer, default=40)
    # uploaded / pending_review / reviewed / extraction_empty
    status: Mapped[str] = mapped_column(String(40), default="uploaded")
    meta: Mapped[dict] = mapped_column(JsonType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    chunks: Mapped[list["ExpansionChunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    items: Mapped[list["ExpansionItem"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class ExpansionChunk(Base):
    """外部扩展资料切块，向量写入 expansion_chunks（与核心库物理隔离）。"""

    __tablename__ = "expansion_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("expansion_sources.id"), nullable=False
    )
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer)
    section_title: Mapped[str | None] = mapped_column(String(255))
    source_layer: Mapped[str] = mapped_column(String(40), default="expansion")
    visibility: Mapped[str] = mapped_column(String(40), default="team")
    qdrant_point_id: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    source: Mapped[ExpansionSource] = relationship(back_populates="chunks")


class ExpansionItem(Base):
    """从外部资料抽取的扩展知识单元，对齐到核心方法论节点，需人工审核。"""

    __tablename__ = "expansion_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("expansion_sources.id"), nullable=False
    )
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("expansion_chunks.id"))
    # 6 类扩展类型之一
    extension_type: Mapped[str] = mapped_column(String(60), default="external_view_extensions")
    title: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    key_points: Mapped[list] = mapped_column(JsonType, default=list)
    # 对齐到的核心方法论节点（可空），及对齐相似度
    aligned_node_id: Mapped[str | None] = mapped_column(
        ForeignKey("methodology_nodes.id")
    )
    alignment_score: Mapped[float] = mapped_column(Float, default=0.0)
    # pending / approved / rejected
    review_status: Mapped[str] = mapped_column(String(40), default="pending")
    source_layer: Mapped[str] = mapped_column(String(40), default="expansion")
    visibility: Mapped[str] = mapped_column(String(40), default="team")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    source: Mapped[ExpansionSource] = relationship(back_populates="items")


class ReviewTask(Base):
    """人工审核任务：外部扩展进入正式知识网络前的审核闸口。"""

    __tablename__ = "review_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    item_id: Mapped[str] = mapped_column(
        ForeignKey("expansion_items.id"), nullable=False
    )
    task_type: Mapped[str] = mapped_column(String(60), default="expansion_review")
    # pending / approved / rejected
    status: Mapped[str] = mapped_column(String(40), default="pending")
    reviewer: Mapped[str | None] = mapped_column(String(120))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)


class KnowledgeNodeVersion(Base):
    """核心方法论节点的版本演进：吸收已审核扩展，叠加补充上下文。

    重要：版本演进只叠加 supplementary_context，绝不覆盖核心字段
    （definition/core_principle/core_thinking/decision_logic）。
    """

    __tablename__ = "knowledge_node_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    node_id: Mapped[str] = mapped_column(
        ForeignKey("methodology_nodes.id"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(20), default="v1.1")
    # expansion_absorption / manual_edit / rollback
    change_type: Mapped[str] = mapped_column(String(40), default="expansion_absorption")
    change_summary: Mapped[str] = mapped_column(Text, default="")
    supplementary_context: Mapped[str] = mapped_column(Text, default="")
    incorporated_item_ids: Mapped[list] = mapped_column(JsonType, default=list)
    status: Mapped[str] = mapped_column(String(40), default="active")
    created_by: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
