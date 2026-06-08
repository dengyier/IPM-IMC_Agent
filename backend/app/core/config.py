from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "天机AI 商业决策智能体"
    environment: str = "local"

    # 数据库：PostgreSQL（生产）/ SQLite（本地回退）
    database_url: str = "sqlite:///./data/imc_ipm.db"

    # Qdrant 向量库
    qdrant_url: str = "http://127.0.0.1:6333"
    methodology_core_collection: str = "methodology_core_chunks"
    expansion_collection: str = "expansion_chunks"
    assistant_file_collection: str = "assistant_file_chunks"

    # DeepSeek（OpenAI 兼容）
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-pro"

    # 腾讯云短信验证码
    tencentcloud_secret_id: str | None = None
    tencentcloud_secret_key: str | None = None
    tencentcloud_region: str = "ap-guangzhou"
    tencentsms_sdk_app_id: str | None = None
    tencentsms_sign_name: str | None = None
    tencentsms_template_id: str | None = None
    tencentsms_template_param_count: int = 1
    sms_code_ttl_seconds: int = 300
    sms_code_send_interval_seconds: int = 60
    sms_code_max_attempts: int = 5
    auth_session_ttl_days: int = 30

    # Embedding 可插拔
    embedding_provider: str = "local"  # local | openai
    embedding_dim: int = 256
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None
    embedding_model: str = "bge-m3"

    # 文件存储
    storage_dir: Path = Path("./data/uploads")

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"), env_file_encoding="utf-8", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
