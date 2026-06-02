"""根据数据库中的知识切块重建 Qdrant 向量集合。

用途：
    DATABASE_URL=postgresql+psycopg://... \
    QDRANT_URL=http://127.0.0.1:6333 \
    python scripts/rebuild_vector_collections.py

默认只 upsert，不删除既有集合。首次生产迁移或确认已备份后，可加 --recreate
先重建 methodology_core_chunks / expansion_chunks 两个集合，避免残留旧向量点。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_embeddings  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.models import ExpansionChunk, ExpansionSource, MethodologyChunk, MethodologySource  # noqa: E402
from app.db.session import SessionLocal, init_db  # noqa: E402
from app.services.vector_store import VectorStore  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild Qdrant vectors from database chunks.")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="危险操作：先删除并重建两个 Qdrant collection，再写入向量。",
    )
    return parser.parse_args()


def _recreate_collection(collection: str, vector_size: int) -> None:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Distance, VectorParams

    settings = get_settings()
    client = QdrantClient(url=settings.qdrant_url, timeout=30.0)
    if client.collection_exists(collection):
        client.delete_collection(collection_name=collection)
    client.create_collection(
        collection_name=collection,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )


def _core_payload(chunk: MethodologyChunk, source: MethodologySource | None) -> dict[str, Any]:
    return {
        "chunk_id": chunk.id,
        "source_id": chunk.source_id,
        "source_type": source.source_type if source else None,
        "topic": chunk.topic,
        "section_title": chunk.section_title,
        "page_number": chunk.page_number,
        "source_layer": "imc_ipm_core",
        "visibility": "internal_only",
        "authority_level": chunk.authority_level,
        "text": chunk.chunk_text,
    }


def _expansion_payload(chunk: ExpansionChunk, source: ExpansionSource | None) -> dict[str, Any]:
    return {
        "chunk_id": chunk.id,
        "source_id": chunk.source_id,
        "source_type": source.source_type if source else None,
        "section_title": chunk.section_title,
        "page_number": chunk.page_number,
        "source_layer": "expansion",
        "visibility": chunk.visibility,
        "review_status": source.status if source else None,
        "submitted_by": source.submitted_by if source else None,
        "text": chunk.chunk_text,
    }


def _upsert_batches(store: VectorStore, rows: list[tuple[str, str, dict[str, Any]]]) -> int:
    embeddings = get_embeddings()
    total = 0
    batch_size = 128
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        vectors = embeddings.embed_texts([text for _, text, _ in batch])
        store.upsert([(pid, vec, payload) for (pid, _, payload), vec in zip(batch, vectors)])
        total += len(batch)
    return total


def rebuild(recreate: bool = False) -> None:
    settings = get_settings()
    init_db()

    if recreate:
        print("已启用 --recreate：将删除并重建 Qdrant 集合。")
        _recreate_collection(settings.methodology_core_collection, settings.embedding_dim)
        _recreate_collection(settings.expansion_collection, settings.embedding_dim)

    core_store = VectorStore(
        url=settings.qdrant_url,
        collection=settings.methodology_core_collection,
        vector_size=settings.embedding_dim,
    )
    expansion_store = VectorStore(
        url=settings.qdrant_url,
        collection=settings.expansion_collection,
        vector_size=settings.embedding_dim,
    )
    if core_store.backend != "qdrant" or expansion_store.backend != "qdrant":
        raise SystemExit("Qdrant 未连接，已停止重建向量集合。")

    db = SessionLocal()
    try:
        methodology_sources = {source.id: source for source in db.query(MethodologySource).all()}
        methodology_chunks = db.query(MethodologyChunk).order_by(MethodologyChunk.chunk_index).all()
        core_rows = [
            (
                chunk.qdrant_point_id or chunk.id,
                chunk.chunk_text,
                _core_payload(chunk, methodology_sources.get(chunk.source_id)),
            )
            for chunk in methodology_chunks
        ]

        expansion_sources = {source.id: source for source in db.query(ExpansionSource).all()}
        expansion_chunks = db.query(ExpansionChunk).order_by(ExpansionChunk.chunk_index).all()
        expansion_rows = [
            (
                chunk.qdrant_point_id or chunk.id,
                chunk.chunk_text,
                _expansion_payload(chunk, expansion_sources.get(chunk.source_id)),
            )
            for chunk in expansion_chunks
        ]
    finally:
        db.close()

    core_count = _upsert_batches(core_store, core_rows)
    expansion_count = _upsert_batches(expansion_store, expansion_rows)
    print(f"{settings.methodology_core_collection}: 写入 {core_count} 个向量点。")
    print(f"{settings.expansion_collection}: 写入 {expansion_count} 个向量点。")


if __name__ == "__main__":
    args = _parse_args()
    rebuild(recreate=args.recreate)
