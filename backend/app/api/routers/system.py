"""系统健康检查 / 连接测试 / 只读配置路由。"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_core_store, get_llm
from app.core.config import Settings
from app.db.models import SystemSettings
from app.db.session import get_db
from app.schemas.system import (
    ComponentHealth,
    EditableSystemSettings,
    EditableSystemSettingsUpdate,
    LLMTestResult,
    SettingsOut,
    SystemHealth,
    VectorStoreTestResult,
)
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/system", tags=["system"])

# 组件状态严重程度排序，用于计算总体状态（取最差）
_SEVERITY = {"ok": 0, "offline_fallback": 1, "offline": 2, "error": 3}


def _mask_secret(value: str | None) -> str:
    """密钥掩码：仅保留前 3 / 后 4 字符，其余以 * 替代。"""
    if not value:
        return "未配置"
    if len(value) <= 8:
        return "****"
    return f"{value[:3]}****{value[-4:]}"


def _get_or_create_editable_settings(db: Session) -> SystemSettings:
    row = db.get(SystemSettings, "default")
    if row:
        return row
    row = SystemSettings(id="default")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/health", response_model=SystemHealth)
def health(
    settings: Settings = Depends(get_app_settings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> SystemHealth:
    db_backend = "postgresql" if settings.database_url.startswith("postgres") else "sqlite"
    components = [
        ComponentHealth(
            key="database",
            label="数据库",
            status="ok",
            detail=f"{db_backend} 已连接",
            meta={"backend": db_backend},
        ),
        ComponentHealth(
            key="qdrant",
            label="向量库",
            status="ok" if core_store.backend == "qdrant" else "offline_fallback",
            detail="Qdrant 已连接" if core_store.backend == "qdrant" else "内存回退（未连接 Qdrant）",
            meta={"backend": core_store.backend, "collection": core_store.collection},
        ),
        ComponentHealth(
            key="llm",
            label="大模型",
            status="ok" if llm.available else "offline_fallback",
            detail=f"{llm.model} 已就绪" if llm.available else "未配置 API Key，走本地确定性回退",
            meta={"model": llm.model},
        ),
        ComponentHealth(
            key="embedding",
            label="向量化",
            status="ok" if settings.embedding_provider else "error",
            detail=f"{settings.embedding_provider} / {settings.embedding_dim} 维",
            meta={
                "provider": settings.embedding_provider,
                "dim": settings.embedding_dim,
                "model": settings.embedding_model,
            },
        ),
    ]
    overall = max((c.status for c in components), key=lambda s: _SEVERITY[s])
    return SystemHealth(
        status=overall,
        app_name=settings.app_name,
        environment=settings.environment,
        version="0.1.0",
        components=components,
    )


@router.post("/test-llm", response_model=LLMTestResult)
def test_llm(llm: LLMService = Depends(get_llm)) -> LLMTestResult:
    """实时往返一次最小请求，回传连通性与延迟（含错误明细）。"""
    return LLMTestResult(**llm.ping())


@router.post("/test-vector-store", response_model=VectorStoreTestResult)
def test_vector_store(
    core_store: VectorStore = Depends(get_core_store),
) -> VectorStoreTestResult:
    started = time.perf_counter()
    stats = core_store.stats()
    latency = int((time.perf_counter() - started) * 1000)
    return VectorStoreTestResult(latency_ms=latency, **stats)


@router.get("/settings", response_model=SettingsOut)
def get_settings_view(
    settings: Settings = Depends(get_app_settings),
    core_store: VectorStore = Depends(get_core_store),
) -> SettingsOut:
    """只读配置（密钥已掩码）。写入在引入鉴权前不开放。"""
    db_backend = "postgresql" if settings.database_url.startswith("postgres") else "sqlite"
    return SettingsOut(
        app_name=settings.app_name,
        environment=settings.environment,
        database_backend=db_backend,
        qdrant_url=settings.qdrant_url,
        vector_backend=core_store.backend,
        methodology_core_collection=settings.methodology_core_collection,
        expansion_collection=settings.expansion_collection,
        deepseek_base_url=settings.deepseek_base_url,
        deepseek_model=settings.deepseek_model,
        deepseek_api_key_masked=_mask_secret(settings.deepseek_api_key),
        embedding_provider=settings.embedding_provider,
        embedding_model=settings.embedding_model,
        embedding_dim=settings.embedding_dim,
        embedding_api_key_masked=_mask_secret(settings.embedding_api_key),
    )


@router.get("/editable-settings", response_model=EditableSystemSettings)
def get_editable_settings(db: Session = Depends(get_db)) -> SystemSettings:
    """Editable UI settings persisted in database."""
    return _get_or_create_editable_settings(db)


@router.put("/editable-settings", response_model=EditableSystemSettings)
def update_editable_settings(
    payload: EditableSystemSettingsUpdate,
    db: Session = Depends(get_db),
) -> SystemSettings:
    """Update editable settings for the basic settings page."""
    row = _get_or_create_editable_settings(db)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
        if key == "backup_retention_days":
            value = max(1, min(365, int(value)))
        setattr(row, key, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
