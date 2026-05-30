"""知识图谱 + 向量 → 可移植数据包导出。

把本地已构建好的「核心知识图谱 + 向量」打包成一个自包含目录（再压成 .tar.gz），
便于在生产环境直接导入，无需重新解析课件 / 调用 LLM / 重新向量化。

用法：
    python scripts/kg_export.py            # 导出到 data/export/kg_package_<时间戳>
    python scripts/kg_export.py /目标/目录   # 导出到指定目录

产物：
    manifest.json                  元信息（维度/距离/数量/集合名/embedding 配置）
    methodology_core_chunks.ndjson.gz   向量点：每行 {id, vector, payload}
    knowledge_graph.json.gz        关系图：sources / chunks / nodes / edges / routing_rules
    import_to_qdrant.py            独立导入脚本（仅依赖 qdrant-client）
    <整个目录>.tar.gz               压缩包

向量为「确定性本地哈希」，由 chunk 文本可完整复现，因此导出过程会按 SQLite 中
chunk 重新生成向量，与原始入库结果逐位一致。
"""

from __future__ import annotations

import gzip
import json
import shutil
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

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

DEFAULT_OUT = Path(__file__).resolve().parents[1] / "data" / "export"


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _export_vectors(db, embeddings, out_dir: Path) -> tuple[int, Path]:
    """按 SQLite chunk 重新生成确定性向量，写出 ndjson.gz（每行一个向量点）。"""
    sources = {s.id: s for s in db.query(MethodologySource).all()}
    chunks = (
        db.query(MethodologyChunk)
        .order_by(MethodologyChunk.source_id, MethodologyChunk.chunk_index)
        .all()
    )
    path = out_dir / "methodology_core_chunks.ndjson.gz"
    count = 0
    BATCH = 256
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for i in range(0, len(chunks), BATCH):
            batch = chunks[i : i + BATCH]
            vectors = embeddings.embed_texts([c.chunk_text for c in batch])
            for c, vec in zip(batch, vectors):
                src = sources.get(c.source_id)
                payload = {
                    "chunk_id": c.id,
                    "source_id": c.source_id,
                    "source_type": src.source_type if src else None,
                    "topic": c.topic,
                    "section_title": c.section_title,
                    "page_number": c.page_number,
                    "source_layer": "imc_ipm_core",
                    "visibility": "internal_only",
                    "authority_level": c.authority_level,
                    "text": c.chunk_text,
                }
                point_id = c.qdrant_point_id or c.id
                fh.write(
                    json.dumps(
                        {"id": point_id, "vector": vec, "payload": payload},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                count += 1
    return count, path


def _export_graph(db, out_dir: Path) -> dict:
    """导出关系数据（节点/边/路由规则/来源/切块），生产侧可直接灌库。"""
    sources = [
        {
            "id": s.id,
            "title": s.title,
            "source_type": s.source_type,
            "course_session": s.course_session,
            "source_layer": s.source_layer,
            "visibility": s.visibility,
            "authority_level": s.authority_level,
            "status": s.status,
            "meta": s.meta,
            "created_at": _iso(s.created_at),
        }
        for s in db.query(MethodologySource).all()
    ]
    chunks = [
        {
            "id": c.id,
            "source_id": c.source_id,
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text,
            "topic": c.topic,
            "page_number": c.page_number,
            "section_title": c.section_title,
            "source_layer": c.source_layer,
            "visibility": c.visibility,
            "authority_level": c.authority_level,
            "qdrant_point_id": c.qdrant_point_id,
        }
        for c in db.query(MethodologyChunk).all()
    ]
    nodes = [
        {
            "id": n.id,
            "node_name": n.node_name,
            "node_category": n.node_category,
            "definition": n.definition,
            "core_principle": n.core_principle,
            "core_thinking": n.core_thinking,
            "decision_logic": n.decision_logic,
            "key_questions": n.key_questions,
            "common_mistakes": n.common_mistakes,
            "applicable_scenarios": n.applicable_scenarios,
            "source_chunk_ids": n.source_chunk_ids,
            "status": n.status,
            "visibility": n.visibility,
            "authority_level": n.authority_level,
            "version": n.version,
        }
        for n in db.query(MethodologyNode).all()
    ]
    edges = [
        {
            "id": e.id,
            "source_node_id": e.source_node_id,
            "target_node_id": e.target_node_id,
            "relation_type": e.relation_type,
            "relation_description": e.relation_description,
            "weight": e.weight,
            "evidence_chunk_ids": e.evidence_chunk_ids,
        }
        for e in db.query(MethodologyEdge).all()
    ]
    rules = [
        {
            "id": r.id,
            "intent": r.intent,
            "intent_description": r.intent_description,
            "trigger_keywords": r.trigger_keywords,
            "required_node_ids": r.required_node_ids,
            "optional_node_ids": r.optional_node_ids,
            "canvas_modules": r.canvas_modules,
            "routing_priority": r.routing_priority,
            "status": r.status,
        }
        for r in db.query(ProblemRoutingRule).all()
    ]
    graph = {
        "sources": sources,
        "chunks": chunks,
        "nodes": nodes,
        "edges": edges,
        "routing_rules": rules,
    }
    path = out_dir / "knowledge_graph.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(graph, fh, ensure_ascii=False)
    return {
        "sources": len(sources),
        "chunks": len(chunks),
        "nodes": len(nodes),
        "edges": len(edges),
        "routing_rules": len(rules),
    }


IMPORTER = '''"""把本数据包的向量导入生产 Qdrant（独立脚本，仅依赖 qdrant-client）。

用法：
    pip install qdrant-client
    QDRANT_URL=http://生产地址:6333 python import_to_qdrant.py

幂等：按相同 point id upsert，可重复执行。
"""
import gzip
import json
import os
import sys
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, PointStruct, VectorParams

HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
collection = manifest["collection"]
dim = manifest["vector_dim"]
url = os.environ.get("QDRANT_URL", "http://localhost:6333")

client = QdrantClient(url=url, timeout=30.0)
if not client.collection_exists(collection):
    client.create_collection(
        collection_name=collection,
        vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
    )

vec_file = HERE / "methodology_core_chunks.ndjson.gz"
buf, total = [], 0
with gzip.open(vec_file, "rt", encoding="utf-8") as fh:
    for line in fh:
        rec = json.loads(line)
        buf.append(PointStruct(id=rec["id"], vector=rec["vector"], payload=rec["payload"]))
        if len(buf) >= 256:
            client.upsert(collection_name=collection, points=buf)
            total += len(buf)
            buf = []
    if buf:
        client.upsert(collection_name=collection, points=buf)
        total += len(buf)

print(f"已导入 {total} 个向量点到集合 {collection} @ {url}")
'''


def main(out_root: Path) -> None:
    init_db()
    settings = get_settings()
    embeddings = build_embedding_provider(settings)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    out_dir = out_root / f"kg_package_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        print("导出向量（按 chunk 确定性复现）...")
        vec_count, _ = _export_vectors(db, embeddings, out_dir)
        print(f"  向量点: {vec_count}")
        print("导出关系图...")
        graph_counts = _export_graph(db, out_dir)
        print(
            f"  来源 {graph_counts['sources']} | 切块 {graph_counts['chunks']} | "
            f"节点 {graph_counts['nodes']} | 边 {graph_counts['edges']} | "
            f"规则 {graph_counts['routing_rules']}"
        )
    finally:
        db.close()

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "app_name": settings.app_name,
        "collection": settings.methodology_core_collection,
        "vector_dim": settings.embedding_dim,
        "distance": "Cosine",
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.embedding_model,
        "vector_count": vec_count,
        "graph_counts": graph_counts,
        "files": {
            "vectors": "methodology_core_chunks.ndjson.gz",
            "graph": "knowledge_graph.json.gz",
            "importer": "import_to_qdrant.py",
        },
        "note": (
            "向量为确定性本地哈希，可由 chunk 文本复现；生产侧用 import_to_qdrant.py "
            "灌入 Qdrant，关系图用 knowledge_graph.json.gz 灌入关系库。"
        ),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "import_to_qdrant.py").write_text(IMPORTER, encoding="utf-8")

    tar_path = out_root / f"kg_package_{stamp}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(out_dir, arcname=out_dir.name)

    size_mb = tar_path.stat().st_size / 1024 / 1024
    print(f"\n✅ 数据包已生成：")
    print(f"   目录: {out_dir}")
    print(f"   压缩: {tar_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    out = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_OUT
    main(out)
