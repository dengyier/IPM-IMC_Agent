"""系统健康检查路由。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_app_settings, get_core_store, get_llm
from app.core.config import Settings
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
def health(
    settings: Settings = Depends(get_app_settings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> dict:
    return {
        "status": "ok",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "embedding_provider": settings.embedding_provider,
        "embedding_dim": settings.embedding_dim,
        "vector_backend": core_store.backend,
        "core_collection": core_store.collection,
        "llm_available": llm.available,
        "llm_model": llm.model if llm.available else None,
    }
