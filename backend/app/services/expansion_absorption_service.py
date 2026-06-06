"""ExpansionAbsorptionService —— 外部信息吸收与对齐（算法六）。

负责：解析 → 切块 → 向量化(expansion) → 抽取扩展知识单元 → 对齐核心方法论节点
→ 生成 ExpansionItem + ReviewTask（review_status=pending）。

严格保证：
- 外部资料只写 expansion_chunks（与核心库物理隔离）。
- 生成的 item 默认 review_status=pending，未审核不得进入正式节点版本。
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import (
    ExpansionChunk,
    ExpansionItem,
    ExpansionSource,
    MethodologyNode,
    ReviewTask,
)
from app.services.document_parser import chunk_pages, parse_document_pages
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

# extension_type 关键词启发式（命中越多分越高）
_TYPE_KEYWORDS: dict[str, list[str]] = {
    "customer_context_extensions": ["客户", "用户", "行业背景", "市场背景", "场景背景", "人群"],
    "case_extensions": ["案例", "公司", "项目实例", "实例", "复盘", "实战", "故事"],
    "scenario_extensions": ["场景", "情境", "假设情形", "如果", "假设场景"],
    "external_view_extensions": ["观点", "认为", "专家", "文章", "研究", "报告", "理论"],
    "different_views": ["不同意", "反对", "质疑", "另一种", "争议", "相反", "但是"],
    "practice_feedback": ["实践", "落地", "反馈", "试过", "结果是", "经验", "教训"],
}


class ExpansionAbsorptionService:
    def __init__(
        self,
        db: Session,
        embeddings: EmbeddingProvider,
        expansion_store: VectorStore,
        llm: LLMService | None = None,
    ) -> None:
        self.db = db
        self.embeddings = embeddings
        self.expansion_store = expansion_store
        self.llm = llm

    # ------------------------------------------------------------------ #
    # parse + chunk + embed
    # ------------------------------------------------------------------ #

    def parse_and_chunk(self, source: ExpansionSource) -> list[ExpansionChunk]:
        if not source.file_path:
            raise ValueError("来源缺少文件路径，无法解析。")
        pages = parse_document_pages(Path(source.file_path))
        parsed = chunk_pages(pages)
        records: list[ExpansionChunk] = []
        for pc in parsed:
            record = ExpansionChunk(
                tenant_id=source.tenant_id,
                source_id=source.id,
                chunk_text=pc.text,
                chunk_index=pc.chunk_index,
                page_number=pc.page_number,
                section_title=pc.section_title,
                source_layer="expansion",
                visibility=source.visibility,
                qdrant_point_id=str(uuid4()),
            )
            self.db.add(record)
            records.append(record)
        self.db.flush()
        return records

    def embed_chunks(
        self, source: ExpansionSource, records: list[ExpansionChunk]
    ) -> int:
        if not records:
            return 0
        vectors = self.embeddings.embed_texts([r.chunk_text for r in records])
        points = [
            (
                r.qdrant_point_id,
                vec,
                {
                    "chunk_id": r.id,
                    "source_id": source.id,
                    "tenant_id": source.tenant_id,
                    "source_type": source.source_type,
                    "section_title": r.section_title,
                    "page_number": r.page_number,
                    "source_layer": "expansion",
                    "visibility": source.visibility,
                    "review_status": "pending",
                    "text": r.chunk_text,
                },
            )
            for r, vec in zip(records, vectors)
        ]
        self.expansion_store.upsert(points)
        return len(points)

    # ------------------------------------------------------------------ #
    # extract items + align + review tasks
    # ------------------------------------------------------------------ #

    def absorb_items(
        self, source: ExpansionSource, records: list[ExpansionChunk]
    ) -> tuple[list[ExpansionItem], list[ReviewTask]]:
        node_index = self._load_node_index()

        items: list[ExpansionItem] = []
        tasks: list[ReviewTask] = []
        for chunk in records:
            for section in _split_sections(chunk.chunk_text):
                if len(section) < 30:
                    continue
                ext_type = self._classify(section, source.source_type)
                aligned_id, score = self._align(section, node_index)
                item = ExpansionItem(
                    tenant_id=source.tenant_id,
                    source_id=source.id,
                    chunk_id=chunk.id,
                    extension_type=ext_type,
                    title=_make_title(section),
                    content=section[:1200],
                    summary=_summarize(section),
                    key_points=_key_points(section),
                    aligned_node_id=aligned_id,
                    alignment_score=round(score, 4),
                    review_status="pending",
                    source_layer="expansion",
                    visibility=source.visibility,
                )
                self.db.add(item)
                self.db.flush()
                items.append(item)

                task = ReviewTask(
                    tenant_id=source.tenant_id,
                    item_id=item.id,
                    task_type="expansion_review",
                    status="pending",
                )
                self.db.add(task)
                tasks.append(task)

                if len(items) >= 60:
                    break
            if len(items) >= 60:
                break
        self.db.flush()
        return items, tasks

    # ------------------------------------------------------------------ #
    # alignment to core nodes
    # ------------------------------------------------------------------ #

    def _load_node_index(self) -> list[tuple[str, list[float]]]:
        nodes = (
            self.db.query(MethodologyNode)
            .filter(MethodologyNode.status == "active")
            .all()
        )
        if not nodes:
            return []
        texts = [self._node_text(n) for n in nodes]
        vecs = self.embeddings.embed_texts(texts)
        return [(n.id, v) for n, v in zip(nodes, vecs)]

    def _align(
        self, text: str, node_index: list[tuple[str, list[float]]]
    ) -> tuple[str | None, float]:
        if not node_index:
            return None, 0.0
        qv = self.embeddings.embed_text(text)
        best_id, best = None, 0.0
        for node_id, nv in node_index:
            s = _cosine(qv, nv)
            if s > best:
                best, best_id = s, node_id
        return best_id, best

    @staticmethod
    def _node_text(node: MethodologyNode) -> str:
        parts = [
            node.node_name or "",
            node.node_category or "",
            node.definition or "",
            node.core_principle or "",
            node.core_thinking or "",
        ]
        parts.extend(node.applicable_scenarios or [])
        return "\n".join(p for p in parts if p)

    @staticmethod
    def _classify(text: str, source_type: str) -> str:
        scores = {
            t: sum(1 for kw in kws if kw in text)
            for t, kws in _TYPE_KEYWORDS.items()
        }
        best_type = max(scores, key=lambda k: scores[k])
        if scores[best_type] == 0:
            # 无关键词命中时按来源类型回退
            fallback = {
                "classmate_note": "practice_feedback",
                "case": "case_extensions",
                "article": "external_view_extensions",
                "external_view": "external_view_extensions",
                "practice_feedback": "practice_feedback",
                "scenario": "scenario_extensions",
            }
            return fallback.get(source_type, "external_view_extensions")
        return best_type


# --------------------------------------------------------------------------- #
# 辅助函数
# --------------------------------------------------------------------------- #


def _split_sections(text: str) -> list[str]:
    cleaned = re.sub(r"\r\n?", "\n", text.strip())
    heading_split = re.split(r"\n(?=#{1,4}\s|\d+[.、]\s|[一二三四五六七八九十]+、)", cleaned)
    if len(heading_split) > 1:
        return [s.strip() for s in heading_split if s.strip()]
    return [s.strip() for s in re.split(r"\n\s*\n", cleaned) if s.strip()]


def _make_title(text: str) -> str:
    first_line = text.splitlines()[0].strip("# 0123456789.、 ")
    if 4 <= len(first_line) <= 40:
        return first_line
    return _summarize(text, limit=24)


def _summarize(text: str, limit: int = 200) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:limit] + ("..." if len(compact) > limit else "")


def _key_points(text: str, max_points: int = 4) -> list[str]:
    parts = re.split(r"[。；;\n]", text)
    points = [p.strip() for p in parts if len(p.strip()) >= 8]
    return points[:max_points]


def _cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, dot / (na * nb))
