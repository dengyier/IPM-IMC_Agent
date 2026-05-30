from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IMC&IPM 商业决策智能体"
    environment: str = "local"

    # 数据库：PostgreSQL（生产）/ SQLite（本地回退）
    database_url: str = "sqlite:///./data/imc_ipm.db"

    # Qdrant 向量库
    qdrant_url: str = "http://localhost:6333"
    methodology_core_collection: str = "methodology_core_chunks"
    expansion_collection: str = "expansion_chunks"

    # DeepSeek（OpenAI 兼容）
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # Embedding 可插拔
    embedding_provider: str = "local"  # local | openai
    embedding_dim: int = 256
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None
    embedding_model: str = "bge-m3"

    # 文件存储
    storage_dir: Path = Path("./data/uploads")

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
