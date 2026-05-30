"""FastAPI 依赖装配：共享 embeddings / 向量库 / LLM / 存储 单例。"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import Settings, get_settings
from app.services.embeddings import EmbeddingProvider, build_embedding_provider
from app.services.llm import LLMService
from app.services.storage import LocalStorage
from app.services.vector_store import VectorStore


@lru_cache
def get_embeddings() -> EmbeddingProvider:
    return build_embedding_provider(get_settings())


@lru_cache
def get_core_store() -> VectorStore:
    settings = get_settings()
    return VectorStore(
        url=settings.qdrant_url,
        collection=settings.methodology_core_collection,
        vector_size=settings.embedding_dim,
    )


@lru_cache
def get_expansion_store() -> VectorStore:
    settings = get_settings()
    return VectorStore(
        url=settings.qdrant_url,
        collection=settings.expansion_collection,
        vector_size=settings.embedding_dim,
    )


@lru_cache
def get_llm() -> LLMService:
    return LLMService(get_settings())


@lru_cache
def get_storage() -> LocalStorage:
    return LocalStorage(get_settings().storage_dir)


def get_app_settings() -> Settings:
    return get_settings()
