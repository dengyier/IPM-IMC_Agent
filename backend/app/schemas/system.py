"""系统健康 / 连接测试 / 配置读取 schemas。

约束：任何密钥都必须**掩码**返回，绝不回传明文。
"""

from __future__ import annotations

from datetime import datetime
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


class EditableSystemSettings(BaseModel):
    """Admin-editable settings shown in the basic settings tab."""

    system_name: str
    system_short_name: str
    system_version: str
    deployment_environment: str
    deployed_at: str
    timezone: str
    company_name: str
    company_short_name: str
    company_website: str
    language: str
    date_format: str
    time_format: str
    number_format: str
    currency: str
    theme_mode: str
    accent_color: str
    nav_density: str
    allow_registration: bool
    require_2fa: bool
    require_email_verification: bool
    audit_log_enabled: bool
    auto_backup_enabled: bool
    backup_retention_days: int
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class EditableSystemSettingsUpdate(BaseModel):
    system_name: str | None = None
    system_short_name: str | None = None
    system_version: str | None = None
    deployment_environment: str | None = None
    deployed_at: str | None = None
    timezone: str | None = None
    company_name: str | None = None
    company_short_name: str | None = None
    company_website: str | None = None
    language: str | None = None
    date_format: str | None = None
    time_format: str | None = None
    number_format: str | None = None
    currency: str | None = None
    theme_mode: str | None = None
    accent_color: str | None = None
    nav_density: str | None = None
    allow_registration: bool | None = None
    require_2fa: bool | None = None
    require_email_verification: bool | None = None
    audit_log_enabled: bool | None = None
    auto_backup_enabled: bool | None = None
    backup_retention_days: int | None = None
