"""Qdrant 向量库封装，带内存回退。

每个 collection 是可搜索的向量点集合，每个点带 payload。支持按 payload 字段过滤
（如 visibility / source_layer / review_status），用于实现“主干优先”的分层检索。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SearchHit:
    id: str
    score: float
    payload: dict[str, Any]


class VectorStore:
    def __init__(self, url: str, collection: str, vector_size: int = 256):
        self.collection = collection
        self.vector_size = vector_size
        self._memory: dict[str, tuple[list[float], dict[str, Any]]] = {}
        self.client = None
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http.models import Distance, VectorParams

            client = QdrantClient(url=url, timeout=5.0)
            if not client.collection_exists(collection):
                client.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(
                        size=vector_size, distance=Distance.COSINE
                    ),
                )
            self.client = client
        except Exception:
            self.client = None

    @property
    def backend(self) -> str:
        return "qdrant" if self.client else "memory"

    def stats(self) -> dict:
        """向量库连通性 + 规模信息，用于「测试向量库」。

        memory 回退视为可用但降级（offline_fallback）；qdrant 真实 count。
        """
        if not self.client:
            return {
                "ok": True,
                "backend": "memory",
                "collection": self.collection,
                "vector_size": self.vector_size,
                "point_count": len(self._memory),
                "detail": "未连接 Qdrant，使用内存回退（重启即丢）",
            }
        try:
            count = self.client.count(
                collection_name=self.collection, exact=True
            ).count
            return {
                "ok": True,
                "backend": "qdrant",
                "collection": self.collection,
                "vector_size": self.vector_size,
                "point_count": int(count),
                "detail": "连接正常",
            }
        except Exception as exc:  # noqa: BLE001 明细回传前端
            return {
                "ok": False,
                "backend": "qdrant",
                "collection": self.collection,
                "vector_size": self.vector_size,
                "point_count": None,
                "detail": f"{type(exc).__name__}: {exc}",
            }

    def upsert(self, points: list[tuple[str, list[float], dict[str, Any]]]) -> None:
        if self.client:
            from qdrant_client.http.models import PointStruct

            self.client.upsert(
                collection_name=self.collection,
                points=[
                    PointStruct(id=pid, vector=vec, payload=payload)
                    for pid, vec, payload in points
                ],
            )
            return
        for pid, vec, payload in points:
            self._memory[pid] = (vec, payload)

    def search(
        self,
        query_vector: list[float],
        limit: int = 8,
        must_match: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        if self.client:
            return self._search_qdrant(query_vector, limit, must_match)
        return self._search_memory(query_vector, limit, must_match)

    # ------------------------------------------------------------------ #

    def _search_qdrant(
        self, query_vector: list[float], limit: int, must_match: dict[str, Any] | None
    ) -> list[SearchHit]:
        query_filter = None
        if must_match:
            from qdrant_client.http.models import (
                FieldCondition,
                Filter,
                MatchValue,
            )

            query_filter = Filter(
                must=[
                    FieldCondition(key=k, match=MatchValue(value=v))
                    for k, v in must_match.items()
                ]
            )
        hits = self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            limit=limit,
            query_filter=query_filter,
        )
        return [
            SearchHit(id=str(h.id), score=float(h.score), payload=h.payload or {})
            for h in hits
        ]

    def _search_memory(
        self, query_vector: list[float], limit: int, must_match: dict[str, Any] | None
    ) -> list[SearchHit]:
        scored: list[SearchHit] = []
        for pid, (vec, payload) in self._memory.items():
            if must_match and any(payload.get(k) != v for k, v in must_match.items()):
                continue
            scored.append(SearchHit(pid, _cosine(query_vector, vec), payload))
        return sorted(scored, key=lambda h: h.score, reverse=True)[:limit]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))
