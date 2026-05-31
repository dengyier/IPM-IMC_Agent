"""知识节点库查询/聚合服务（列表卡片、分类、子资源）。

只暴露**结构化**字段；不返回原始 chunk 全文（防核心内容外泄）。
"""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.models import (
    ExpansionItem,
    KnowledgeNodeVersion,
    MethodologyEdge,
    MethodologyNode,
)
from app.schemas.methodology import (
    NodeCardOut,
    NodeCategoryCount,
    NodeEdgeOut,
    NodeExpansionOut,
    NodeVersionOut,
    PaginatedNodes,
)

DEF_SNIPPET = 120  # 卡片定义摘要截断长度


class MethodologyQueryService:
    def __init__(self, db: Session):
        self.db = db

    # ----------------------------- 列表 ----------------------------- #

    def list_nodes(
        self,
        category: str | None = None,
        q: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedNodes:
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        base = self.db.query(MethodologyNode).filter(
            MethodologyNode.status == "active"
        )
        if category and category not in ("全部节点", "全部"):
            base = base.filter(MethodologyNode.node_category == category)
        if q:
            like = f"%{q.strip()}%"
            base = base.filter(
                or_(
                    MethodologyNode.node_name.ilike(like),
                    MethodologyNode.definition.ilike(like),
                )
            )

        total = base.count()
        rows = (
            base.order_by(MethodologyNode.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        node_ids = [n.id for n in rows]
        edge_counts = self._edge_counts(node_ids)
        exp_counts = self._expansion_counts(node_ids)

        items = [
            NodeCardOut(
                id=n.id,
                node_name=n.node_name,
                node_category=n.node_category,
                definition=(n.definition or "")[:DEF_SNIPPET],
                status=n.status,
                version=n.version,
                edge_count=edge_counts.get(n.id, 0),
                expansion_count=exp_counts.get(n.id, 0),
                source_chunk_count=len(n.source_chunk_ids or []),
            )
            for n in rows
        ]
        return PaginatedNodes(
            items=items, total=total, page=page, page_size=page_size
        )

    def categories(self, top: int = 8) -> list[NodeCategoryCount]:
        """返回「全部节点」+ 按数量排序的前 top 个分类。

        注：抽取出的 node_category 很细（数百种），列表页 Tab 只取高频前若干，
        其余通过搜索/筛选触达，避免 Tab 爆炸。
        """
        total = (
            self.db.query(func.count(MethodologyNode.id))
            .filter(MethodologyNode.status == "active")
            .scalar()
            or 0
        )
        rows = (
            self.db.query(
                MethodologyNode.node_category, func.count(MethodologyNode.id)
            )
            .filter(MethodologyNode.status == "active")
            .group_by(MethodologyNode.node_category)
            .order_by(func.count(MethodologyNode.id).desc())
            .limit(max(1, top))
            .all()
        )
        out = [NodeCategoryCount(label="全部节点", count=total)]
        for cat, cnt in rows:
            out.append(NodeCategoryCount(label=cat or "未分类", count=cnt))
        return out

    # --------------------------- 子资源 ---------------------------- #

    def node_edges(self, node_id: str) -> list[NodeEdgeOut]:
        edges = (
            self.db.query(MethodologyEdge)
            .filter(
                or_(
                    MethodologyEdge.source_node_id == node_id,
                    MethodologyEdge.target_node_id == node_id,
                )
            )
            .all()
        )
        # 邻居名称批量解析
        neighbor_ids = set()
        for e in edges:
            neighbor_ids.add(
                e.target_node_id
                if e.source_node_id == node_id
                else e.source_node_id
            )
        names = dict(
            self.db.query(MethodologyNode.id, MethodologyNode.node_name)
            .filter(MethodologyNode.id.in_(neighbor_ids))
            .all()
        )
        out: list[NodeEdgeOut] = []
        for e in edges:
            outgoing = e.source_node_id == node_id
            nid = e.target_node_id if outgoing else e.source_node_id
            out.append(
                NodeEdgeOut(
                    id=e.id,
                    relation_type=e.relation_type,
                    relation_description=e.relation_description,
                    weight=e.weight,
                    direction="outgoing" if outgoing else "incoming",
                    neighbor_id=nid,
                    neighbor_name=names.get(nid, "(未知节点)"),
                )
            )
        out.sort(key=lambda x: x.weight, reverse=True)
        return out

    def node_versions(self, node_id: str) -> list[NodeVersionOut]:
        rows = (
            self.db.query(KnowledgeNodeVersion)
            .filter(KnowledgeNodeVersion.node_id == node_id)
            .order_by(KnowledgeNodeVersion.created_at.desc())
            .all()
        )
        return [NodeVersionOut.model_validate(r) for r in rows]

    def node_expansions(self, node_id: str) -> list[NodeExpansionOut]:
        rows = (
            self.db.query(ExpansionItem)
            .filter(ExpansionItem.aligned_node_id == node_id)
            .order_by(ExpansionItem.created_at.desc())
            .all()
        )
        return [NodeExpansionOut.model_validate(r) for r in rows]

    # --------------------------- helpers --------------------------- #

    def _edge_counts(self, node_ids: list[str]) -> dict[str, int]:
        if not node_ids:
            return {}
        counts: dict[str, int] = {nid: 0 for nid in node_ids}
        src_rows = (
            self.db.query(
                MethodologyEdge.source_node_id, func.count(MethodologyEdge.id)
            )
            .filter(MethodologyEdge.source_node_id.in_(node_ids))
            .group_by(MethodologyEdge.source_node_id)
            .all()
        )
        tgt_rows = (
            self.db.query(
                MethodologyEdge.target_node_id, func.count(MethodologyEdge.id)
            )
            .filter(MethodologyEdge.target_node_id.in_(node_ids))
            .group_by(MethodologyEdge.target_node_id)
            .all()
        )
        for nid, c in src_rows:
            counts[nid] = counts.get(nid, 0) + c
        for nid, c in tgt_rows:
            counts[nid] = counts.get(nid, 0) + c
        return counts

    def _expansion_counts(self, node_ids: list[str]) -> dict[str, int]:
        if not node_ids:
            return {}
        rows = (
            self.db.query(
                ExpansionItem.aligned_node_id, func.count(ExpansionItem.id)
            )
            .filter(ExpansionItem.aligned_node_id.in_(node_ids))
            .group_by(ExpansionItem.aligned_node_id)
            .all()
        )
        return {nid: c for nid, c in rows if nid}
