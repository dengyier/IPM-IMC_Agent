"""系统健康 / 连接测试 / 配置读取 schemas。

约束：任何密钥都必须**掩码**返回，绝不回传明文。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

# ok=正常 / offline_fallback=降级可用 / error=异常 / offline=离线
ComponentStatus = Literal["ok", "offline_fallback", "error", "offline"]


class ComponentHealth(BaseModel):
    """单个系统组件的健康明细（前端 systemStatusTone 映射 status → 文案/圆点色）。"""

    key: str  # database / qdrant / llm / embedding
    label: str  # 中文展示名
    status: ComponentStatus
    detail: str = ""
    meta: dict[str, Any] = {}


class SystemHealth(BaseModel):
    status: ComponentStatus  # 总体：取各组件最差
    app_name: str
    environment: str
    version: str
    components: list[ComponentHealth]


class LLMTestResult(BaseModel):
    ok: bool
    model: str
    latency_ms: int | None = None
    detail: str = ""


class VectorStoreTestResult(BaseModel):
    ok: bool
    backend: str  # qdrant / memory
    collection: str
    vector_size: int
    point_count: int | None = None
    latency_ms: int | None = None
    detail: str = ""


class SettingsOut(BaseModel):
    """只读配置视图（密钥掩码）。写入在引入鉴权前不开放。"""

    app_name: str
    environment: str
    database_backend: str  # sqlite / postgresql
    qdrant_url: str
    vector_backend: str  # qdrant / memory
    methodology_core_collection: str
    expansion_collection: str
    deepseek_base_url: str
    deepseek_model: str
    deepseek_api_key_masked: str  # 掩码，例如 "sk-****00a" 或 "未配置"
    embedding_provider: str
    embedding_model: str
    embedding_dim: int
    embedding_api_key_masked: str
