"""临时课程目录 → 核心知识图谱增量升级脚本。

用法：
    python scripts/kg_incremental.py --course-dir /Users/molin/Documents/course --dry-run
    python scripts/kg_incremental.py --course-dir /Users/molin/Documents/course

设计原则：
- 只处理尚未入库的文件，不清空已有知识节点和关系边。
- 新抽取节点按 node_name 与现有节点合并；已有节点仅补充来源 chunk，不覆盖已调教内容。
- 关系边按 (source, target, relation_type) 去重后增量写入。
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from collections import Counter
from pathlib import Path

from sqlalchemy import or_

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.db.models import (  # noqa: E402
    MethodologyChunk,
    MethodologyEdge,
    MethodologyNode,
    MethodologySource,
    ProblemRoutingRule,
)
from app.db.session import SessionLocal, init_db  # noqa: E402
from app.schemas.methodology import MethodologyNodeCandidate, RelatedNodeRef  # noqa: E402
from app.services.document_parser import SUPPORTED_SUFFIXES  # noqa: E402
from app.services.embeddings import build_embedding_provider  # noqa: E402
from app.services.knowledge_graph_service import KnowledgeGraphService  # noqa: E402
from app.services.llm import LLMService  # noqa: E402
from app.services.methodology_kernel_service import MethodologyKernelService  # noqa: E402
from app.services.problem_routing_service import ProblemRoutingService  # noqa: E402
from app.services.vector_store import VectorStore  # noqa: E402


DEFAULT_COURSE_DIR = Path("/Users/molin/Documents/course")
MIN_CHUNK_LEN_FOR_EXTRACTION = 150


def _components():
    settings = get_settings()
    embeddings = build_embedding_provider(settings)
    core_store = VectorStore(
        url=settings.qdrant_url,
        collection=settings.methodology_core_collection,
        vector_size=settings.embedding_dim,
    )
    llm = LLMService(settings)
    return settings, embeddings, core_store, llm


def _stats(db) -> dict[str, int]:
    return {
        "sources": db.query(MethodologySource).count(),
        "chunks": db.query(MethodologyChunk).count(),
        "nodes": db.query(MethodologyNode).count(),
        "edges": db.query(MethodologyEdge).count(),
        "rules": db.query(ProblemRoutingRule).count(),
    }


def _format_stats(stats: dict[str, int]) -> str:
    return (
        f"来源 {stats['sources']} | 切块 {stats['chunks']} | "
        f"节点 {stats['nodes']} | 边 {stats['edges']} | 路由规则 {stats['rules']}"
    )


def _scan_files(course_dir: Path) -> list[Path]:
    if not course_dir.exists():
        raise FileNotFoundError(f"课程目录不存在: {course_dir}")
    return [
        p
        for p in sorted(course_dir.rglob("*"))
        if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
    ]


def _existing_source(db, path: Path) -> MethodologySource | None:
    path_text = str(path)
    return (
        db.query(MethodologySource)
        .filter(or_(MethodologySource.file_path == path_text, MethodologySource.title == path.name))
        .first()
    )


def _processed_sources_for_dir(db, files: list[Path]) -> list[MethodologySource]:
    file_paths = {str(path) for path in files}
    if not file_paths:
        return []
    return (
        db.query(MethodologySource)
        .filter(
            MethodologySource.status == "processed",
            MethodologySource.file_path.in_(file_paths),
        )
        .order_by(MethodologySource.created_at)
        .all()
    )


def _select_chunks(chunks: list[MethodologyChunk]) -> list[MethodologyChunk]:
    from collections import defaultdict

    by_src: dict[str, list[MethodologyChunk]] = defaultdict(list)
    for chunk in chunks:
        if len((chunk.chunk_text or "").strip()) >= MIN_CHUNK_LEN_FOR_EXTRACTION:
            by_src[chunk.source_id].append(chunk)

    interleaved: list[MethodologyChunk] = []
    buckets = list(by_src.values())
    index = 0
    while any(index < len(bucket) for bucket in buckets):
        for bucket in buckets:
            if index < len(bucket):
                interleaved.append(bucket[index])
        index += 1
    return interleaved


def _normal_name(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip()).lower()


def _merge_list(*values: list | None) -> list:
    merged: list = []
    for value in values:
        for item in value or []:
            if item not in merged:
                merged.append(item)
    return merged


def _candidate_text(candidate: MethodologyNodeCandidate) -> str:
    parts = [
        candidate.node_name,
        candidate.node_category or "",
        candidate.definition,
        candidate.core_principle,
        candidate.core_thinking,
    ]
    parts.extend(candidate.applicable_scenarios)
    parts.extend(candidate.key_questions)
    return "\n".join(p for p in parts if p)


def _node_text(node: MethodologyNode) -> str:
    parts = [
        node.node_name or "",
        node.node_category or "",
        node.definition or "",
        node.core_principle or "",
        node.core_thinking or "",
    ]
    parts.extend(node.applicable_scenarios or [])
    parts.extend(node.key_questions or [])
    return "\n".join(p for p in parts if p)


def _apply_nodes(db, candidates: list[MethodologyNodeCandidate]) -> tuple[dict[str, str], int, int]:
    existing_nodes = db.query(MethodologyNode).filter(MethodologyNode.status == "active").all()
    by_normal = {_normal_name(node.node_name): node for node in existing_nodes}
    name_to_id = {node.node_name.strip(): node.id for node in existing_nodes}

    created = 0
    merged = 0
    for candidate in candidates:
        key = _normal_name(candidate.node_name)
        node = by_normal.get(key)
        if node:
            node.source_chunk_ids = _merge_list(node.source_chunk_ids, candidate.source_chunk_ids)
            if not node.node_category and candidate.node_category:
                node.node_category = candidate.node_category
            if not (node.definition or "").strip() and candidate.definition:
                node.definition = candidate.definition
            if not (node.core_principle or "").strip() and candidate.core_principle:
                node.core_principle = candidate.core_principle
            if not (node.core_thinking or "").strip() and candidate.core_thinking:
                node.core_thinking = candidate.core_thinking
            node.decision_logic = _merge_list(node.decision_logic, candidate.decision_logic)
            node.key_questions = _merge_list(node.key_questions, candidate.key_questions)
            node.common_mistakes = _merge_list(node.common_mistakes, candidate.common_mistakes)
            node.applicable_scenarios = _merge_list(
                node.applicable_scenarios, candidate.applicable_scenarios
            )
            db.add(node)
            name_to_id[candidate.node_name.strip()] = node.id
            merged += 1
            continue

        node = MethodologyNode(
            node_name=candidate.node_name.strip(),
            node_category=candidate.node_category,
            definition=candidate.definition,
            core_principle=candidate.core_principle,
            core_thinking=candidate.core_thinking,
            decision_logic=candidate.decision_logic,
            key_questions=candidate.key_questions,
            common_mistakes=candidate.common_mistakes,
            applicable_scenarios=candidate.applicable_scenarios,
            source_chunk_ids=candidate.source_chunk_ids,
            status="active",
            visibility="internal_only",
            authority_level=100,
            version="v1.0",
        )
        db.add(node)
        db.flush()
        by_normal[key] = node
        name_to_id[candidate.node_name.strip()] = node.id
        created += 1

    db.flush()
    return name_to_id, created, merged


def _augment_related_nodes(
    db,
    embeddings,
    candidates: list[MethodologyNodeCandidate],
    name_to_id: dict[str, str],
    per_candidate: int = 2,
) -> None:
    """用语义相似度把新节点接入旧图谱，补足 LLM 未显式命名旧节点的关系。"""
    existing_nodes = [
        node
        for node in db.query(MethodologyNode).filter(MethodologyNode.status == "active").all()
        if node.node_name.strip() not in {c.node_name.strip() for c in candidates}
    ]
    if not existing_nodes or not candidates:
        return

    candidate_texts = [_candidate_text(c) for c in candidates]
    existing_texts = [_node_text(n) for n in existing_nodes]
    candidate_vectors = embeddings.embed_texts(candidate_texts)
    existing_vectors = embeddings.embed_texts(existing_texts)

    for candidate, candidate_vector in zip(candidates, candidate_vectors):
        scores: list[tuple[float, MethodologyNode]] = []
        for node, node_vector in zip(existing_nodes, existing_vectors):
            score = _cosine(candidate_vector, node_vector)
            if candidate.node_category and candidate.node_category == node.node_category:
                score += 0.08
            scenario_overlap = set(candidate.applicable_scenarios or []) & set(
                node.applicable_scenarios or []
            )
            if scenario_overlap:
                score += min(0.1, len(scenario_overlap) * 0.03)
            if score >= 0.42:
                scores.append((score, node))
        scores.sort(key=lambda item: item[0], reverse=True)
        for score, node in scores[:per_candidate]:
            if node.id == name_to_id.get(candidate.node_name.strip()):
                continue
            candidate.related_nodes.append(
                RelatedNodeRef(
                    target=node.node_name,
                    relation_type="supports" if score < 0.62 else "extends",
                    description="增量导入时基于语义相似度与方法论类别自动接入旧图谱。",
                )
            )


def _apply_edges(db, embeddings, candidates: list[MethodologyNodeCandidate], name_to_id: dict[str, str]) -> int:
    graph = KnowledgeGraphService(db, embeddings)
    vectors = graph._node_vectors(candidates, name_to_id)  # noqa: SLF001
    chunk_sets = {
        name_to_id[c.node_name.strip()]: set(c.source_chunk_ids)
        for c in candidates
        if c.node_name.strip() in name_to_id
    }
    existing = {
        (edge.source_node_id, edge.target_node_id, edge.relation_type)
        for edge in db.query(MethodologyEdge).all()
    }

    added = 0
    for candidate in candidates:
        source_id = name_to_id.get(candidate.node_name.strip())
        if not source_id:
            continue
        for ref in candidate.related_nodes:
            target_id = name_to_id.get(ref.target.strip())
            if not target_id or target_id == source_id:
                continue
            relation = ref.relation_type
            key = (source_id, target_id, relation)
            if key in existing:
                continue
            weight = graph._edge_weight(  # noqa: SLF001
                src_id=source_id,
                tgt_id=target_id,
                relation=relation,
                vectors=vectors,
                chunk_sets=chunk_sets,
            )
            evidence = sorted(chunk_sets.get(source_id, set()) & chunk_sets.get(target_id, set()))
            db.add(
                MethodologyEdge(
                    source_node_id=source_id,
                    target_node_id=target_id,
                    relation_type=relation,
                    relation_description=ref.description or None,
                    weight=round(weight, 4),
                    evidence_chunk_ids=evidence,
                )
            )
            existing.add(key)
            added += 1
    db.flush()
    return added


def _cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    import math

    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, dot / (na * nb))


def run(course_dir: Path, *, dry_run: bool = False, batch_size: int = 12) -> None:
    init_db()
    _, embeddings, core_store, llm = _components()
    db = SessionLocal()
    try:
        before = _stats(db)
        print(f"当前图谱: {_format_stats(before)}")
        print(f"向量后端: {core_store.backend} | LLM: {'on' if llm.available else 'off'}")
        print(f"增量目录: {course_dir}\n")

        files = _scan_files(course_dir)
        existing: list[Path] = []
        pending: list[Path] = []
        for path in files:
            source = _existing_source(db, path)
            if source and source.status in {"processed", "kernel_built"}:
                existing.append(path)
            else:
                pending.append(path)

        print(f"扫描文件: {len(files)} | 已入库跳过: {len(existing)} | 待增量: {len(pending)}")
        if pending:
            by_suffix = Counter(path.suffix.lower() for path in pending)
            print("待处理类型: " + ", ".join(f"{suffix}={count}" for suffix, count in by_suffix.items()))
        if dry_run:
            for path in pending:
                print(f"  - {path.name}")
            print("\nDRY-RUN：未写入数据库/向量库。")
            return
        kernel = MethodologyKernelService(db, embeddings, core_store, llm)
        for index, path in enumerate(pending, start=1):
            source = MethodologySource(
                title=path.name,
                source_type="courseware",
                file_path=str(path),
                source_layer="imc_ipm_core",
                visibility="internal_only",
                authority_level=100,
                status="uploaded",
                meta={
                    "original_filename": path.name,
                    "size": path.stat().st_size,
                    "imported_from_temp_dir": str(course_dir),
                    "incremental_import": True,
                },
            )
            db.add(source)
            db.flush()
            started = time.time()
            records = kernel.parse_and_chunk(source)
            embedded = kernel.embed_core_chunks(source, records)
            source.status = "processed"
            db.add(source)
            db.commit()
            print(
                f"[{index}/{len(pending)}] {path.name} — "
                f"切块 {len(records)}, 向量 {embedded}, {time.time() - started:.1f}s"
            )

        build_sources = _processed_sources_for_dir(db, files)
        if not build_sources:
            print("没有发现需要构建节点的 processed 来源。")
            return

        build_source_ids = [source.id for source in build_sources]
        build_chunks = (
            db.query(MethodologyChunk)
            .filter(MethodologyChunk.source_id.in_(build_source_ids))
            .order_by(MethodologyChunk.source_id, MethodologyChunk.chunk_index)
            .all()
        )
        selected = _select_chunks(build_chunks)
        print(
            f"\n待构建来源: {len(build_sources)} | 切块: {len(build_chunks)} | "
            f"入抽取: {len(selected)} | 批大小: {batch_size}"
        )

        def progress(batch_index, total, nodes):
            print(f"  抽取批次 {batch_index}/{total} — 累计候选节点 {nodes}", flush=True)

        started = time.time()
        candidates, used_llm = kernel.extract_nodes_batched(
            selected, batch_size=batch_size, progress=progress
        )
        print(
            f"节点抽取完成: {len(candidates)} 个候选 "
            f"({'LLM' if used_llm else '本地回退'}), {time.time() - started:.1f}s"
        )

        name_to_id, created_nodes, merged_nodes = _apply_nodes(db, candidates)
        _augment_related_nodes(db, embeddings, candidates, name_to_id)
        added_edges = _apply_edges(db, embeddings, candidates, name_to_id)

        rules = ProblemRoutingService(db).generate_rules(replace_existing=True)
        for source in build_sources:
            source.status = "kernel_built"
            db.add(source)
        db.commit()

        after = _stats(db)
        print("\n增量升级完成")
        print(f"新增节点: {created_nodes} | 合并节点: {merged_nodes} | 新增关系边: {added_edges}")
        print(f"刷新路由规则: {len(rules)}")
        print(f"升级前: {_format_stats(before)}")
        print(f"升级后: {_format_stats(after)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="IMC&IPM 核心知识图谱增量升级")
    parser.add_argument("--course-dir", type=Path, default=DEFAULT_COURSE_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=12)
    args = parser.parse_args()
    run(args.course_dir.expanduser().resolve(), dry_run=args.dry_run, batch_size=args.batch_size)


if __name__ == "__main__":
    main()
