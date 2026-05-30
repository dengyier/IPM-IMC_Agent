"""课程课件 → 核心知识图谱 批量构建脚本。

用法：
    python scripts/kg_build.py process   # 解析+切块+向量化 全部课件
    python scripts/kg_build.py build     # 跨全部切块 LLM 抽取节点 → 边 → 路由规则
    python scripts/kg_build.py stats      # 查看当前图谱统计

跳过：扫描件（无可提取文本）与重复文件。
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# 允许直接以脚本方式运行
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
from app.services.embeddings import build_embedding_provider  # noqa: E402
from app.services.knowledge_graph_service import KnowledgeGraphService  # noqa: E402
from app.services.llm import LLMService  # noqa: E402
from app.services.methodology_kernel_service import MethodologyKernelService  # noqa: E402
from app.services.problem_routing_service import ProblemRoutingService  # noqa: E402
from app.services.vector_store import VectorStore  # noqa: E402

COURSE_DIR = Path("/Users/molin/Documents/IMC&IPM 商业决策智能体/course")

# 跳过：扫描件（0 可提取文本）+ 重复文件
SKIP = {
    "IPM CD15_05_AMI_Sopio Zheng.pdf",          # 扫描件，无文本
    "IPM CD15_06_SMM_Kevin Xu (1).pdf",         # 扫描件，无文本
    "IPM CD15_02_实效管理和商业战略_Wei Wei.pdf",   # 与 PMBS_Wei Wei.pdf 内容重复
}


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


def _select_chunks(all_chunks, min_len: int = 150):
    """过滤过短/噪声切块，并按来源 round-robin 交错，使每批覆盖多门课件。"""
    from collections import defaultdict

    by_src: dict[str, list] = defaultdict(list)
    for c in all_chunks:
        if len((c.chunk_text or "").strip()) >= min_len:
            by_src[c.source_id].append(c)
    # round-robin 交错
    interleaved = []
    buckets = list(by_src.values())
    i = 0
    while any(i < len(b) for b in buckets):
        for b in buckets:
            if i < len(b):
                interleaved.append(b[i])
        i += 1
    return interleaved


def _selected_files() -> list[Path]:
    files = [
        p
        for p in sorted(COURSE_DIR.iterdir())
        if p.suffix.lower() in {".pdf", ".pptx"} and p.name not in SKIP
    ]
    return files


def cmd_process() -> None:
    init_db()
    _, embeddings, core_store, llm = _components()
    print(f"向量后端: {core_store.backend} | LLM: {'on' if llm.available else 'off'}")
    files = _selected_files()
    print(f"待处理课件: {len(files)} 个\n")

    db = SessionLocal()
    total_chunks = 0
    try:
        kernel = MethodologyKernelService(db, embeddings, core_store, llm)
        for i, path in enumerate(files, start=1):
            # 已处理过则跳过（按文件名去重）
            exists = (
                db.query(MethodologySource)
                .filter(MethodologySource.title == path.name)
                .first()
            )
            if exists and exists.status in {"processed", "kernel_built"}:
                cnt = (
                    db.query(MethodologyChunk)
                    .filter(MethodologyChunk.source_id == exists.id)
                    .count()
                )
                total_chunks += cnt
                print(f"[{i}/{len(files)}] 跳过(已处理) {path.name} — {cnt} 块")
                continue

            source = MethodologySource(
                title=path.name,
                source_type="courseware",
                file_path=str(path),
                source_layer="imc_ipm_core",
                visibility="internal_only",
                authority_level=100,
                status="uploaded",
                meta={"original_filename": path.name, "size": path.stat().st_size},
            )
            db.add(source)
            db.flush()
            t0 = time.time()
            try:
                records = kernel.parse_and_chunk(source)
                embedded = kernel.embed_core_chunks(source, records)
                source.status = "processed"
                db.add(source)
                db.commit()
                total_chunks += len(records)
                print(
                    f"[{i}/{len(files)}] {path.name} — {len(records)} 块, "
                    f"向量 {embedded}, {time.time()-t0:.1f}s"
                )
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                print(f"[{i}/{len(files)}] 解析失败 {path.name}: {exc}")
        print(f"\n总切块数: {total_chunks}")
    finally:
        db.close()


def cmd_build(batch_size: int = 12, max_batches: int | None = None) -> None:
    init_db()
    _, embeddings, core_store, llm = _components()
    db = SessionLocal()
    try:
        all_chunks = (
            db.query(MethodologyChunk)
            .order_by(MethodologyChunk.source_id, MethodologyChunk.chunk_index)
            .all()
        )
        if not all_chunks:
            print("无切块，请先运行 process。")
            return
        chunks = _select_chunks(all_chunks, min_len=150)
        print(
            f"全部切块: {len(all_chunks)} | 过滤后入抽取: {len(chunks)} | "
            f"LLM: {'on' if llm.available else 'off'}"
        )
        print(f"批大小: {batch_size}, 批数上限: {max_batches or '全部'}\n")

        kernel = MethodologyKernelService(db, embeddings, core_store, llm)

        def progress(bi, total, nodes):
            print(f"  批 {bi}/{total} — 累计节点 {nodes}", flush=True)

        t0 = time.time()
        candidates, used_llm = kernel.extract_nodes_batched(
            chunks, batch_size=batch_size, max_batches=max_batches, progress=progress
        )
        print(f"\n抽取完成: {len(candidates)} 节点 ({'LLM' if used_llm else '本地'}), "
              f"{time.time()-t0:.1f}s")

        # 清空旧图谱后重建（保证统一图谱一致）
        db.query(MethodologyEdge).delete()
        db.query(MethodologyNode).delete()
        db.flush()

        name_to_id = kernel.persist_nodes(candidates)
        print(f"落库节点: {len(name_to_id)}")

        graph_svc = KnowledgeGraphService(db, embeddings)
        edges = graph_svc.build_edges(candidates, name_to_id)
        print(f"构建关系边: {len(edges)}")

        rules = ProblemRoutingService(db).generate_rules(replace_existing=True)
        print(f"生成路由规则: {len(rules)}")

        # 来源状态更新
        for s in db.query(MethodologySource).all():
            if s.status == "processed":
                s.status = "kernel_built"
                db.add(s)
        db.commit()
        print("\n✅ 统一知识图谱构建完成")
    finally:
        db.close()


def cmd_stats() -> None:
    init_db()
    db = SessionLocal()
    try:
        ns = db.query(MethodologyNode).count()
        es = db.query(MethodologyEdge).count()
        rs = db.query(ProblemRoutingRule).count()
        srcs = db.query(MethodologySource).count()
        chs = db.query(MethodologyChunk).count()
        print(f"来源: {srcs} | 切块: {chs} | 节点: {ns} | 边: {es} | 路由规则: {rs}")
        print("\n— 关系类型分布 —")
        from collections import Counter

        rels = Counter(
            e.relation_type for e in db.query(MethodologyEdge).all()
        )
        for rel, n in rels.most_common():
            print(f"  {rel}: {n}")
        print("\n— 节点分类分布 —")
        cats = Counter(
            (n.node_category or "未分类") for n in db.query(MethodologyNode).all()
        )
        for cat, n in cats.most_common(20):
            print(f"  {cat}: {n}")
    finally:
        db.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "process":
        cmd_process()
    elif cmd == "build":
        bs = int(sys.argv[2]) if len(sys.argv) > 2 else 12
        mb = int(sys.argv[3]) if len(sys.argv) > 3 else None
        cmd_build(batch_size=bs, max_batches=mb)
    elif cmd == "stats":
        cmd_stats()
    else:
        print(__doc__)
