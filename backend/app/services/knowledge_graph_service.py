"""KnowledgeGraphService —— 核心方法论知识网络构建（算法二）。

负责：基于节点候选的 related_nodes + 语义/共现/决策顺序信号，构建 MethodologyEdge。

边权重公式（来自 MKE 文档）::

    weight = 0.4·semantic + 0.3·co_occurrence + 0.2·decision_order + 0.1·human_confirm

- semantic：两节点定义/思考路径的向量余弦相似度。
- co_occurrence：两节点引用到的核心切块是否重叠。
- decision_order：是否构成决策先后关系（prerequisite/causes/validates 等）。
- human_confirm：是否经过人工确认（Phase 1 自动构建默认 0）。
"""

from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app.db.models import MethodologyEdge, MethodologyNode
from app.schemas.methodology import MethodologyNodeCandidate
from app.services.embeddings import EmbeddingProvider

# 体现“决策先后/因果”的关系类型，给予 decision_order 信号
_ORDERED_RELATIONS = {"prerequisite", "causes", "validates", "risk_trigger", "constrains"}

# 合法关系类型（与 schemas.RelationType 对齐）
_VALID_RELATIONS = {
    "prerequisite",
    "supports",
    "causes",
    "constrains",
    "validates",
    "extends",
    "contrasts",
    "risk_trigger",
}


class KnowledgeGraphService:
    def __init__(self, db: Session, embeddings: EmbeddingProvider) -> None:
        self.db = db
        self.embeddings = embeddings

    # ------------------------------------------------------------------ #
    # build edges
    # ------------------------------------------------------------------ #

    def build_edges(
        self,
        candidates: list[MethodologyNodeCandidate],
        name_to_id: dict[str, str],
    ) -> list[MethodologyEdge]:
        """根据候选节点的 related_nodes 构建关系边。

        - target 通过 name_to_id 解析为节点 id；无法解析则跳过。
        - 同一对 (source, target, relation_type) 去重。
        - 边权重由四信号加权得到。
        """
        if not candidates or not name_to_id:
            return []

        # 预计算每个节点的向量与切块集合，供 semantic / co_occurrence 使用
        vectors = self._node_vectors(candidates, name_to_id)
        chunk_sets = {
            name_to_id[c.node_name.strip()]: set(c.source_chunk_ids)
            for c in candidates
            if c.node_name.strip() in name_to_id
        }

        seen: set[tuple[str, str, str]] = set()
        edges: list[MethodologyEdge] = []

        for cand in candidates:
            src_key = cand.node_name.strip()
            src_id = name_to_id.get(src_key)
            if not src_id:
                continue
            for ref in cand.related_nodes:
                tgt_id = name_to_id.get(ref.target.strip())
                if not tgt_id or tgt_id == src_id:
                    continue
                relation = ref.relation_type if ref.relation_type in _VALID_RELATIONS else "supports"
                dedup_key = (src_id, tgt_id, relation)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                weight = self._edge_weight(
                    src_id=src_id,
                    tgt_id=tgt_id,
                    relation=relation,
                    vectors=vectors,
                    chunk_sets=chunk_sets,
                )
                evidence = sorted(
                    chunk_sets.get(src_id, set()) & chunk_sets.get(tgt_id, set())
                )
                edge = MethodologyEdge(
                    source_node_id=src_id,
                    target_node_id=tgt_id,
                    relation_type=relation,
                    relation_description=ref.description or None,
                    weight=round(weight, 4),
                    evidence_chunk_ids=evidence,
                )
                self.db.add(edge)
                edges.append(edge)

        self.db.flush()
        return edges

    # ------------------------------------------------------------------ #
    # neighbor queries
    # ------------------------------------------------------------------ #

    def neighbors(self, node_id: str) -> list[MethodologyEdge]:
        """返回与某节点相关的所有边（出边 + 入边）。"""
        return (
            self.db.query(MethodologyEdge)
            .filter(
                (MethodologyEdge.source_node_id == node_id)
                | (MethodologyEdge.target_node_id == node_id)
            )
            .all()
        )

    # ------------------------------------------------------------------ #
    # internal
    # ------------------------------------------------------------------ #

    def _node_vectors(
        self,
        candidates: list[MethodologyNodeCandidate],
        name_to_id: dict[str, str],
    ) -> dict[str, list[float]]:
        items = [
            (name_to_id[c.node_name.strip()], self._node_text(c))
            for c in candidates
            if c.node_name.strip() in name_to_id
        ]
        if not items:
            return {}
        vecs = self.embeddings.embed_texts([text for _, text in items])
        return {node_id: vec for (node_id, _), vec in zip(items, vecs)}

    @staticmethod
    def _node_text(c: MethodologyNodeCandidate) -> str:
        parts = [c.node_name, c.definition, c.core_principle, c.core_thinking]
        parts.extend(c.applicable_scenarios)
        return "\n".join(p for p in parts if p)

    def _edge_weight(
        self,
        *,
        src_id: str,
        tgt_id: str,
        relation: str,
        vectors: dict[str, list[float]],
        chunk_sets: dict[str, set[str]],
    ) -> float:
        semantic = _cosine(vectors.get(src_id), vectors.get(tgt_id))

        src_chunks = chunk_sets.get(src_id, set())
        tgt_chunks = chunk_sets.get(tgt_id, set())
        union = src_chunks | tgt_chunks
        co_occurrence = (len(src_chunks & tgt_chunks) / len(union)) if union else 0.0

        decision_order = 1.0 if relation in _ORDERED_RELATIONS else 0.0
        human_confirm = 0.0  # Phase 1 自动构建，未经人工确认

        return (
            0.4 * semantic
            + 0.3 * co_occurrence
            + 0.2 * decision_order
            + 0.1 * human_confirm
        )


def _cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, dot / (na * nb))
