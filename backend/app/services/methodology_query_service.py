"""知识节点库查询/聚合服务（列表卡片、分类、子资源）。

只暴露**结构化**字段；不返回原始 chunk 全文（防核心内容外泄）。
"""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.models import (
    ExpansionItem,
    KnowledgeNodeVersion,
    MethodologyChunk,
    MethodologyEdge,
    MethodologyNode,
    MethodologySource,
)
from app.schemas.methodology import (
    GraphEdge,
    GraphNode,
    MethodologyGraphOut,
    NodeCardOut,
    NodeCategoryCount,
    NodeEdgeOut,
    NodeExpansionOut,
    NodeFilterOption,
    NodeFilterOptions,
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
        status: str | None = None,
        source_type: str | None = None,
        scenario: str | None = None,
        version: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedNodes:
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        base = self.db.query(MethodologyNode)
        if status and status not in ("all", "全部", "全部状态"):
            base = base.filter(MethodologyNode.status == status)
        else:
            base = base.filter(MethodologyNode.status == "active")
        if category and category not in ("全部节点", "全部"):
            base = base.filter(MethodologyNode.node_category == category)
        if version and version not in ("all", "全部", "全部版本"):
            base = base.filter(MethodologyNode.version == version)
        if q:
            like = f"%{q.strip()}%"
            base = base.filter(
                or_(
                    MethodologyNode.node_name.ilike(like),
                    MethodologyNode.definition.ilike(like),
                )
            )

        rows_all = base.order_by(MethodologyNode.created_at.desc()).all()
        if scenario and scenario not in ("all", "全部", "全部场景"):
            rows_all = [
                n for n in rows_all if scenario in (n.applicable_scenarios or [])
            ]
        if source_type and source_type not in ("all", "全部", "全部来源"):
            source_chunk_ids = self._chunk_ids_by_source_type(source_type)
            rows_all = [
                n
                for n in rows_all
                if set(n.source_chunk_ids or []).intersection(source_chunk_ids)
            ]

        total = len(rows_all)
        rows = rows_all[(page - 1) * page_size : page * page_size]
        node_ids = [n.id for n in rows]
        edge_counts = self._edge_counts(node_ids)
        exp_counts = self._expansion_counts(node_ids)
        source_types = self._node_source_types(rows)

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
                source_types=source_types.get(n.id, []),
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

    def filter_options(self) -> NodeFilterOptions:
        nodes = (
            self.db.query(MethodologyNode)
            .filter(MethodologyNode.status == "active")
            .all()
        )
        status_rows = (
            self.db.query(MethodologyNode.status, func.count(MethodologyNode.id))
            .group_by(MethodologyNode.status)
            .order_by(func.count(MethodologyNode.id).desc())
            .all()
        )
        version_rows = (
            self.db.query(MethodologyNode.version, func.count(MethodologyNode.id))
            .filter(MethodologyNode.status == "active")
            .group_by(MethodologyNode.version)
            .order_by(func.count(MethodologyNode.id).desc())
            .all()
        )

        scenario_counts: dict[str, int] = {}
        for n in nodes:
            for s in n.applicable_scenarios or []:
                if isinstance(s, str) and s.strip():
                    scenario_counts[s.strip()] = scenario_counts.get(s.strip(), 0) + 1

        source_counts: dict[str, int] = {}
        source_types = self._node_source_types(nodes)
        for types in source_types.values():
            for t in types:
                source_counts[t] = source_counts.get(t, 0) + 1

        return NodeFilterOptions(
            statuses=[
                NodeFilterOption(label=s or "未定义", value=s or "", count=c)
                for s, c in status_rows
            ],
            source_types=[
                NodeFilterOption(label=t, value=t, count=c)
                for t, c in sorted(source_counts.items(), key=lambda x: (-x[1], x[0]))
            ],
            scenarios=[
                NodeFilterOption(label=s, value=s, count=c)
                for s, c in sorted(
                    scenario_counts.items(), key=lambda x: (-x[1], x[0])
                )[:40]
            ],
            versions=[
                NodeFilterOption(label=v or "未定义", value=v or "", count=c)
                for v, c in version_rows
            ],
        )

    # --------------------------- 子资源 ---------------------------- #

    def graph(self, limit: int = 40, offset: int = 0) -> MethodologyGraphOut:
        """按连接度分页返回真实知识图谱节点和关系边。

        - 首页预览使用 offset=0, limit=40。
        - 完整图谱页每次增加 offset，按 40 个节点一批加载。
        - 边返回规则：当前批次节点与“已加载范围(0..offset+limit)”内节点之间的边，
          前端逐批 merge 后即可逐步补全关系网络。
        """
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        total_nodes = (
            self.db.query(func.count(MethodologyNode.id))
            .filter(MethodologyNode.status == "active")
            .scalar()
            or 0
        )
        total_edges = self.db.query(func.count(MethodologyEdge.id)).scalar() or 0

        # 全库各节点连接度（source + target）
        degree: dict[str, int] = {}
        for nid, c in (
            self.db.query(MethodologyEdge.source_node_id, func.count(MethodologyEdge.id))
            .group_by(MethodologyEdge.source_node_id)
            .all()
        ):
            degree[nid] = degree.get(nid, 0) + c
        for nid, c in (
            self.db.query(MethodologyEdge.target_node_id, func.count(MethodologyEdge.id))
            .group_by(MethodologyEdge.target_node_id)
            .all()
        ):
            degree[nid] = degree.get(nid, 0) + c

        all_nodes = (
            self.db.query(MethodologyNode)
            .filter(MethodologyNode.status == "active")
            .all()
        )
        ordered_nodes = sorted(
            all_nodes,
            key=lambda n: (-(degree.get(n.id, 0)), n.node_category or "", n.node_name),
        )
        loaded_nodes = ordered_nodes[: offset + limit]
        page_nodes = ordered_nodes[offset : offset + limit]

        if not page_nodes:
            return MethodologyGraphOut(
                nodes=[],
                edges=[],
                total_nodes=total_nodes,
                total_edges=total_edges,
                limit=limit,
                offset=offset,
                has_more=False,
            )

        nodes = [
            GraphNode(
                id=n.id,
                node_name=n.node_name,
                node_category=n.node_category,
                degree=degree.get(n.id, 0),
            )
            for n in page_nodes
        ]

        loaded_set = {n.id for n in loaded_nodes}
        page_set = {n.id for n in page_nodes}
        edge_rows = (
            self.db.query(MethodologyEdge)
            .filter(
                MethodologyEdge.source_node_id.in_(loaded_set),
                MethodologyEdge.target_node_id.in_(loaded_set),
            )
            .all()
        )
        edges = [
            GraphEdge(
                source=e.source_node_id,
                target=e.target_node_id,
                relation_type=e.relation_type,
            )
            for e in edge_rows
            if e.source_node_id in page_set or e.target_node_id in page_set
        ]
        return MethodologyGraphOut(
            nodes=nodes,
            edges=edges,
            total_nodes=total_nodes,
            total_edges=total_edges,
            limit=limit,
            offset=offset,
            has_more=offset + limit < total_nodes,
        )

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

    def _chunk_ids_by_source_type(self, source_type: str) -> set[str]:
        rows = (
            self.db.query(MethodologyChunk.id)
            .join(MethodologySource, MethodologyChunk.source_id == MethodologySource.id)
            .filter(MethodologySource.source_type == source_type)
            .all()
        )
        return {row[0] for row in rows}

    def _node_source_types(self, nodes: list[MethodologyNode]) -> dict[str, list[str]]:
        chunk_ids: set[str] = set()
        for n in nodes:
            chunk_ids.update(n.source_chunk_ids or [])
        if not chunk_ids:
            return {n.id: [] for n in nodes}

        rows = (
            self.db.query(MethodologyChunk.id, MethodologySource.source_type)
            .join(MethodologySource, MethodologyChunk.source_id == MethodologySource.id)
            .filter(MethodologyChunk.id.in_(chunk_ids))
            .all()
        )
        chunk_type = {cid: st for cid, st in rows}
        result: dict[str, list[str]] = {}
        for n in nodes:
            types = {
                chunk_type[cid]
                for cid in (n.source_chunk_ids or [])
                if cid in chunk_type and chunk_type[cid]
            }
            result[n.id] = sorted(types)
        return result
