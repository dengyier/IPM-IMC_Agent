"""ContextFusionService —— 分层上下文融合（算法五）。

按诊断优先级把多源上下文融合为一个供诊断使用的上下文包：

    核心方法论节点 > 核心切块 context > 已审核外部扩展 > 已审核企业案例 > 未审核资料(不参与)

综合打分公式（来自 MKE 文档）::

    final_context_score = 0.45·node + 0.25·core_chunk + 0.15·approved_expansion
                          + 0.10·case + 0.05·recency

铁律：
- 未审核扩展(review_status != approved)绝不参与正式诊断。
- core_chunks 仅供内部推理，标记 internal_only，不得进入对外报告。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import ExpansionItem, MethodologyEdge, MethodologyNode
from app.schemas.diagnosis import RoutingDecision
from app.services.embeddings import EmbeddingProvider
from app.services.knowledge_graph_service import KnowledgeGraphService
from app.services.vector_store import VectorStore

# 优先级权重
W_NODE = 0.45
W_CORE_CHUNK = 0.25
W_APPROVED_EXPANSION = 0.15
W_CASE = 0.10
W_RECENCY = 0.05
GRAPH_RELATION_WHITELIST = {"supports", "prerequisite", "causes", "validates", "constrains"}


@dataclass
class FusedNode:
    id: str
    node_name: str
    node_category: str | None
    definition: str
    core_principle: str
    core_thinking: str
    decision_logic: list[str]
    key_questions: list[str]
    applicable_scenarios: list[str]
    score: float
    source: str = "methodology_node"
    expanded_from_node_id: str | None = None
    relation_type: str | None = None


@dataclass
class FusedExpansion:
    id: str
    extension_type: str
    title: str
    summary: str
    aligned_node_id: str | None
    score: float


@dataclass
class FusedContext:
    nodes: list[FusedNode] = field(default_factory=list)
    # 仅内部使用，不得对外暴露原文
    core_chunks: list[dict] = field(default_factory=list)
    approved_expansions: list[FusedExpansion] = field(default_factory=list)
    cases: list[FusedExpansion] = field(default_factory=list)
    composite_score: float = 0.0
    graph_expanded_count: int = 0


class ContextFusionService:
    def __init__(
        self,
        db: Session,
        embeddings: EmbeddingProvider,
        core_store: VectorStore,
    ) -> None:
        self.db = db
        self.embeddings = embeddings
        self.core_store = core_store

    def fuse(
        self,
        question: str,
        routing: RoutingDecision,
        canvas: dict[str, str] | None = None,
        tenant_id: str | None = None,
    ) -> FusedContext:
        query_text = (question or "") + "\n" + "\n".join((canvas or {}).values())
        qv = self.embeddings.embed_text(query_text or "商业决策")

        nodes = self._fuse_nodes(routing, qv)
        nodes = self._expand_graph_nodes(nodes)
        node_ids = [n.id for n in nodes]
        core_chunks = self._fuse_core_chunks(qv)
        approved, cases = self._fuse_expansions(node_ids, qv, tenant_id)

        # 综合分（用于追踪/排序参考）
        node_avg = _avg([n.score for n in nodes])
        chunk_avg = _avg([c["score"] for c in core_chunks])
        exp_avg = _avg([e.score for e in approved])
        case_avg = _avg([c.score for c in cases])
        recency = 1.0  # 当前会话即时数据，recency 取满
        composite = (
            W_NODE * node_avg
            + W_CORE_CHUNK * chunk_avg
            + W_APPROVED_EXPANSION * exp_avg
            + W_CASE * case_avg
            + W_RECENCY * recency
        )

        return FusedContext(
            nodes=nodes,
            core_chunks=core_chunks,
            approved_expansions=approved,
            cases=cases,
            composite_score=round(composite, 4),
            graph_expanded_count=len([n for n in nodes if n.source == "graph_expanded"]),
        )

    # ------------------------------------------------------------------ #
    # 节点（最高优先级）
    # ------------------------------------------------------------------ #

    def _fuse_nodes(self, routing: RoutingDecision, qv: list[float]) -> list[FusedNode]:
        ids = list(dict.fromkeys(routing.required_node_ids + routing.optional_node_ids))
        if not ids:
            nodes = (
                self.db.query(MethodologyNode)
                .filter(MethodologyNode.status == "active")
                .all()
            )
        else:
            nodes = (
                self.db.query(MethodologyNode)
                .filter(MethodologyNode.id.in_(ids))
                .all()
            )
        required = set(routing.required_node_ids)
        fused: list[FusedNode] = []
        for n in nodes:
            # required 节点给基础高分，optional 略低
            base = 1.0 if n.id in required else 0.7
            fused.append(
                FusedNode(
                    id=n.id,
                    node_name=n.node_name,
                    node_category=n.node_category,
                    definition=n.definition,
                    core_principle=n.core_principle,
                    core_thinking=n.core_thinking,
                    decision_logic=list(n.decision_logic or []),
                    key_questions=list(n.key_questions or []),
                    applicable_scenarios=list(n.applicable_scenarios or []),
                    score=base,
                )
            )
        fused.sort(key=lambda x: x.score, reverse=True)
        return fused

    def _expand_graph_nodes(self, direct_nodes: list[FusedNode]) -> list[FusedNode]:
        if not direct_nodes:
            return direct_nodes
        existing_ids = {node.id for node in direct_nodes}
        candidates: list[tuple[float, MethodologyEdge, str, FusedNode]] = []
        graph = KnowledgeGraphService(self.db, self.embeddings)
        for source_node in direct_nodes:
            per_source: list[tuple[float, MethodologyEdge, str, FusedNode]] = []
            for edge in graph.neighbors(source_node.id):
                if edge.relation_type not in GRAPH_RELATION_WHITELIST:
                    continue
                neighbor_id = (
                    edge.target_node_id
                    if edge.source_node_id == source_node.id
                    else edge.source_node_id
                )
                if neighbor_id in existing_ids:
                    continue
                score = round(float(edge.weight or 0.0) * source_node.score * 0.6, 4)
                score = min(score, max(source_node.score - 0.01, 0.01))
                per_source.append((score, edge, neighbor_id, source_node))
            per_source.sort(key=lambda item: item[0], reverse=True)
            candidates.extend(per_source[:2])

        candidates.sort(key=lambda item: item[0], reverse=True)
        expanded: list[FusedNode] = []
        for score, edge, node_id, source_node in candidates:
            if len(expanded) >= 6 or node_id in existing_ids:
                continue
            node = self.db.get(MethodologyNode, node_id)
            if not node or node.status != "active":
                continue
            expanded.append(
                FusedNode(
                    id=node.id,
                    node_name=node.node_name,
                    node_category=node.node_category,
                    definition=node.definition,
                    core_principle=node.core_principle,
                    core_thinking=node.core_thinking,
                    decision_logic=list(node.decision_logic or []),
                    key_questions=list(node.key_questions or []),
                    applicable_scenarios=list(node.applicable_scenarios or []),
                    score=score,
                    source="graph_expanded",
                    expanded_from_node_id=source_node.id,
                    relation_type=edge.relation_type,
                )
            )
            existing_ids.add(node_id)
        return [*direct_nodes, *expanded]

    # ------------------------------------------------------------------ #
    # 核心切块 context（仅内部）
    # ------------------------------------------------------------------ #

    def _fuse_core_chunks(self, qv: list[float], limit: int = 5) -> list[dict]:
        hits = self.core_store.search(
            qv, limit=limit, must_match={"visibility": "internal_only"}
        )
        return [
            {
                "chunk_id": h.payload.get("chunk_id"),
                "section_title": h.payload.get("section_title"),
                "text": h.payload.get("text", ""),  # internal only
                "score": round(float(h.score), 4),
                "internal_only": True,
            }
            for h in hits
        ]

    # ------------------------------------------------------------------ #
    # 已审核扩展 + 已审核案例
    # ------------------------------------------------------------------ #

    def _fuse_expansions(
        self, node_ids: list[str], qv: list[float], tenant_id: str | None = None
    ) -> tuple[list[FusedExpansion], list[FusedExpansion]]:
        # 只取已审核通过的扩展（未审核不参与正式诊断）
        query = self.db.query(ExpansionItem).filter(
            ExpansionItem.review_status == "approved"
        )
        # 多租户隔离：仅检索本租户的扩展（super_admin 传 None 时不限）
        if tenant_id is not None:
            query = query.filter(ExpansionItem.tenant_id == tenant_id)
        if node_ids:
            query = query.filter(ExpansionItem.aligned_node_id.in_(node_ids))
        items = query.order_by(ExpansionItem.created_at.desc()).all()

        approved: list[FusedExpansion] = []
        cases: list[FusedExpansion] = []
        for it in items:
            fe = FusedExpansion(
                id=it.id,
                extension_type=it.extension_type,
                title=it.title,
                summary=it.summary or it.content[:200],
                aligned_node_id=it.aligned_node_id,
                score=round(float(it.alignment_score or 0.0), 4),
            )
            if it.extension_type == "case_extensions":
                cases.append(fe)
            else:
                approved.append(fe)
        return approved, cases


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0
