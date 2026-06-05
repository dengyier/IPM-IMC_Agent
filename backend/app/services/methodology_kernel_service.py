"""MethodologyKernelService —— 核心方法论内核抽取算法（算法一）。

负责：解析 → 切块 → 向量化(core) → 抽取方法论节点（LLM + 本地确定性回退）→ 落库。
严格保证核心方法论切块只写 methodology_core_chunks，且 visibility=internal_only、
authority_level=100。
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import MethodologyChunk, MethodologyNode, MethodologySource
from app.schemas.methodology import MethodologyNodeCandidate, RelatedNodeRef
from app.services.document_parser import chunk_pages, parse_document_pages
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

BUSINESS_KEYWORDS = [
    "商业模式", "品牌", "客户", "价值主张", "渠道", "收入", "成本", "资源",
    "活动", "伙伴", "风险", "假设", "验证", "项目", "组织", "定位", "增长",
    "战略", "决策", "市场", "竞争", "客户细分", "最小可行", "现金流",
]

VALID_RELATION_TYPES = {
    "prerequisite",
    "supports",
    "causes",
    "constrains",
    "validates",
    "extends",
    "contrasts",
    "risk_trigger",
}

NODE_EXTRACTION_SYSTEM = (
    "你是港大 IMC&IPM 核心方法论结构化专家。请从课程资料中提炼可用于企业商业决策的"
    "核心方法论节点。注意：你不是提取关键词，而是提取可用于商业判断的思维单元；必须提炼"
    "核心原则、思考路径和决策逻辑；不要编造资料中不存在的观点；只输出 JSON 对象，根字段为 nodes。"
)


class MethodologyKernelService:
    def __init__(
        self,
        db: Session,
        embeddings: EmbeddingProvider,
        core_store: VectorStore,
        llm: LLMService | None = None,
    ) -> None:
        self.db = db
        self.embeddings = embeddings
        self.core_store = core_store
        self.llm = llm

    # ------------------------------------------------------------------ #
    # process: parse + chunk + embed_core_chunks
    # ------------------------------------------------------------------ #

    def parse_and_chunk(self, source: MethodologySource) -> list[MethodologyChunk]:
        if not source.file_path:
            raise ValueError("来源缺少文件路径，无法解析。")
        pages = parse_document_pages(Path(source.file_path))
        parsed = chunk_pages(pages)
        records: list[MethodologyChunk] = []
        for pc in parsed:
            record = MethodologyChunk(
                source_id=source.id,
                chunk_text=pc.text,
                chunk_index=pc.chunk_index,
                topic=pc.topic,
                page_number=pc.page_number,
                section_title=pc.section_title,
                source_layer="imc_ipm_core",
                visibility="internal_only",
                authority_level=source.authority_level,
                qdrant_point_id=str(uuid4()),
            )
            self.db.add(record)
            records.append(record)
        self.db.flush()
        return records

    def embed_core_chunks(
        self, source: MethodologySource, records: list[MethodologyChunk]
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
                    "source_type": source.source_type,
                    "topic": r.topic,
                    "section_title": r.section_title,
                    "page_number": r.page_number,
                    "source_layer": "imc_ipm_core",
                    "visibility": "internal_only",
                    "authority_level": r.authority_level,
                    "text": r.chunk_text,
                },
            )
            for r, vec in zip(records, vectors)
        ]
        self.core_store.upsert(points)
        return len(points)

    # ------------------------------------------------------------------ #
    # extract methodology nodes
    # ------------------------------------------------------------------ #

    def extract_nodes(
        self, chunks: list[MethodologyChunk]
    ) -> tuple[list[MethodologyNodeCandidate], bool]:
        llm_nodes = self._llm_extract(chunks)
        if llm_nodes:
            return self._enrich(llm_nodes), True
        return self._enrich(self._local_extract(chunks)), False

    def persist_nodes(
        self, candidates: list[MethodologyNodeCandidate]
    ) -> dict[str, str]:
        name_to_id: dict[str, str] = {}
        for cand in candidates:
            node = MethodologyNode(
                node_name=cand.node_name,
                node_category=cand.node_category,
                definition=cand.definition,
                core_principle=cand.core_principle,
                core_thinking=cand.core_thinking,
                decision_logic=cand.decision_logic,
                key_questions=cand.key_questions,
                common_mistakes=cand.common_mistakes,
                applicable_scenarios=cand.applicable_scenarios,
                source_chunk_ids=cand.source_chunk_ids,
                status="active",
                visibility="internal_only",
                authority_level=100,
                version="v1.0",
            )
            self.db.add(node)
            self.db.flush()
            name_to_id[cand.node_name.strip()] = node.id
        return name_to_id

    # ------------------------------------------------------------------ #
    # LLM extraction
    # ------------------------------------------------------------------ #

    def extract_nodes_batched(
        self,
        chunks: list[MethodologyChunk],
        batch_size: int = 12,
        max_batches: int | None = None,
        progress=None,
    ) -> tuple[list[MethodologyNodeCandidate], bool]:
        """跨全部切块分批用 LLM 抽取节点，合并去重后补全。

        返回 (candidates, used_llm)。LLM 不可用时回退到本地确定性抽取。
        """
        if not self.llm or not self.llm.available:
            return self._enrich(self._local_extract(chunks)), False

        merged: dict[str, MethodologyNodeCandidate] = {}
        batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]
        if max_batches is not None:
            batches = batches[:max_batches]
        used_llm = False
        for bi, batch in enumerate(batches, start=1):
            cands = self._llm_extract_chunks(batch)
            if cands:
                used_llm = True
                for c in cands:
                    key = c.node_name.strip()
                    if key in merged:
                        existing = merged[key]
                        existing.source_chunk_ids.extend(c.source_chunk_ids)
                        existing.related_nodes.extend(c.related_nodes)
                        if len(c.definition) > len(existing.definition):
                            existing.definition = c.definition
                    else:
                        merged[key] = c
            if progress:
                progress(bi, len(batches), len(merged))

        if not merged:
            return self._enrich(self._local_extract(chunks)), False
        # 清理重复 chunk id
        for c in merged.values():
            c.source_chunk_ids = list(dict.fromkeys(c.source_chunk_ids))
        return self._enrich(list(merged.values())), used_llm

    def _llm_extract(
        self, chunks: list[MethodologyChunk]
    ) -> list[MethodologyNodeCandidate] | None:
        if not self.llm or not self.llm.available:
            return None
        return self._llm_extract_chunks(chunks[:20])

    def _llm_extract_chunks(
        self, sample: list[MethodologyChunk]
    ) -> list[MethodologyNodeCandidate] | None:
        if not self.llm or not self.llm.available or not sample:
            return None
        payload = [
            {"chunk_id": c.id, "page": c.page_number, "text": c.chunk_text[:800]}
            for c in sample
        ]
        user = (
            "请从下列核心方法论切片中抽取方法论节点。每个节点字段："
            "node_name, node_category, definition, core_principle(核心原则), "
            "core_thinking(思考路径), decision_logic(数组,推理步骤), "
            "key_questions(数组), common_mistakes(数组), applicable_scenarios(数组), "
            "source_chunk_ids(引用到的 chunk_id 数组), related_nodes(数组,元素含 "
            "target=另一节点 node_name, relation_type ∈ [prerequisite,supports,causes,"
            "constrains,validates,extends,contrasts,risk_trigger], description)。\n\n"
            f"切片数据：\n{json.dumps(payload, ensure_ascii=False)}"
        )
        data = self.llm.chat_json(NODE_EXTRACTION_SYSTEM, user)
        if not data:
            return None
        result: list[MethodologyNodeCandidate] = []
        for item in data.get("nodes", []):
            if not isinstance(item, dict) or not item.get("node_name"):
                continue
            related = []
            for relation in item.get("related_nodes", []):
                if not isinstance(relation, dict):
                    related.append(RelatedNodeRef(target=str(relation)))
                    continue
                normalized = dict(relation)
                if normalized.get("relation_type") not in VALID_RELATION_TYPES:
                    normalized["relation_type"] = "supports"
                related.append(RelatedNodeRef(**normalized))
            result.append(
                MethodologyNodeCandidate(
                    node_name=str(item["node_name"]),
                    node_category=item.get("node_category"),
                    definition=item.get("definition", ""),
                    core_principle=item.get("core_principle", ""),
                    core_thinking=item.get("core_thinking", ""),
                    decision_logic=_as_list(item.get("decision_logic")),
                    key_questions=_as_list(item.get("key_questions")),
                    common_mistakes=_as_list(item.get("common_mistakes")),
                    applicable_scenarios=_as_list(item.get("applicable_scenarios")),
                    related_nodes=related,
                    source_chunk_ids=_as_list(item.get("source_chunk_ids")),
                )
            )
        return result or None

    # ------------------------------------------------------------------ #
    # 本地确定性回退
    # ------------------------------------------------------------------ #

    def _local_extract(
        self, chunks: list[MethodologyChunk]
    ) -> list[MethodologyNodeCandidate]:
        candidates: list[MethodologyNodeCandidate] = []
        for chunk in chunks:
            for section in _split_sections(chunk.chunk_text):
                if len(section) < 30:
                    continue
                tags = _extract_tags(section)
                if not tags:
                    continue
                candidates.append(
                    MethodologyNodeCandidate(
                        node_name=_make_title(section, tags),
                        node_category=tags[0],
                        definition=_summarize(section),
                        applicable_scenarios=tags[:3],
                        source_chunk_ids=[chunk.id],
                    )
                )
                if len(candidates) >= 40:
                    break
            if len(candidates) >= 40:
                break
        candidates = _dedupe(candidates)
        _link_by_tag_overlap(candidates)
        if candidates:
            return candidates
        joined = "\n".join(c.chunk_text for c in chunks)[:600]
        return [
            MethodologyNodeCandidate(
                node_name="课程核心方法论",
                node_category="商业方法论",
                definition=_summarize(joined) or "资料已入库，建议人工补充结构化方法论。",
                applicable_scenarios=["商业决策"],
                source_chunk_ids=[chunks[0].id] if chunks else [],
            )
        ]

    # ------------------------------------------------------------------ #
    # 字段补全（enrich）—— 保证下游字段非空
    # ------------------------------------------------------------------ #

    def _enrich(
        self, candidates: list[MethodologyNodeCandidate]
    ) -> list[MethodologyNodeCandidate]:
        for c in candidates:
            cat = c.node_category or "商业本质"
            if not c.core_principle.strip():
                c.core_principle = f"「{c.node_name}」的核心不是表面描述，而是回到{cat}做出可被验证的商业判断。"
            if not c.core_thinking.strip():
                c.core_thinking = (
                    f"分析「{c.node_name}」时，先界定问题、明确客户与场景，再检查关键假设与证据链，"
                    "最后判断风险与下一步验证动作。"
                )
            if not c.decision_logic:
                c.decision_logic = [
                    "先确认关键假设是否成立",
                    "再检查支撑证据是否闭环",
                    "评估风险与代价",
                    "给出可验证的下一步行动",
                ]
            if not c.key_questions:
                c.key_questions = [
                    f"{c.node_name} 想解决的核心问题是什么？",
                    "支撑这个判断的关键假设和证据是什么？",
                    "如果假设不成立，最小代价的验证方式是什么？",
                ]
        return candidates


# --------------------------------------------------------------------------- #
# 辅助函数
# --------------------------------------------------------------------------- #


def _as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def _split_sections(text: str) -> list[str]:
    cleaned = re.sub(r"\r\n?", "\n", text.strip())
    heading_split = re.split(r"\n(?=#{1,4}\s|\d+[.、]\s|[一二三四五六七八九十]+、)", cleaned)
    if len(heading_split) > 1:
        return [s.strip() for s in heading_split if s.strip()]
    return [s.strip() for s in re.split(r"\n\s*\n", cleaned) if s.strip()]


def _extract_tags(text: str) -> list[str]:
    tags = [kw for kw in BUSINESS_KEYWORDS if kw in text]
    if not tags:
        words = re.findall(r"[一-鿿]{2,6}|[A-Za-z][A-Za-z-]{2,}", text)
        tags = [w for w, _ in Counter(words).most_common(4)]
    # 去重保序
    seen: list[str] = []
    for t in tags:
        if t not in seen:
            seen.append(t)
    return seen[:5]


def _make_title(text: str, tags: list[str]) -> str:
    first_line = text.splitlines()[0].strip("# 0123456789.、 ")
    if 4 <= len(first_line) <= 28:
        return first_line
    return f"{tags[0]}方法论" if tags else "方法论节点"


def _summarize(text: str, limit: int = 200) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:limit] + ("..." if len(compact) > limit else "")


def _dedupe(candidates: list[MethodologyNodeCandidate]) -> list[MethodologyNodeCandidate]:
    seen: dict[str, MethodologyNodeCandidate] = {}
    for c in candidates:
        key = c.node_name.strip()
        if key in seen:
            seen[key].source_chunk_ids.extend(c.source_chunk_ids)
            continue
        seen[key] = c
    return list(seen.values())


def _link_by_tag_overlap(candidates: list[MethodologyNodeCandidate]) -> None:
    for i, a in enumerate(candidates):
        a_tags = set(a.applicable_scenarios)
        for b in candidates[i + 1 : i + 4]:
            if a_tags & set(b.applicable_scenarios):
                a.related_nodes.append(
                    RelatedNodeRef(
                        target=b.node_name,
                        relation_type="supports",
                        description="共享适用场景，相互支撑。",
                    )
                )
