"""FastAPI 依赖装配：共享 embeddings / 向量库 / LLM / 存储 单例 + 认证与租户依赖。"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.core.config import Settings, get_settings
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.services.auth_service import ROLE_SUPER_ADMIN, AuthService, can_review
from app.services.embeddings import EmbeddingProvider, build_embedding_provider
from app.services.llm import LLMService, build_reviewer_pool
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
def get_assistant_file_store() -> VectorStore:
    settings = get_settings()
    return VectorStore(
        url=settings.qdrant_url,
        collection=settings.assistant_file_collection,
        vector_size=settings.embedding_dim,
    )


@lru_cache
def get_llm() -> LLMService:
    return LLMService(get_settings())


@lru_cache
def get_reviewer_pool() -> tuple[LLMService, ...]:
    """BACH 异构评审模型池（不含主模型）；未配置时为空元组。"""
    return tuple(build_reviewer_pool(get_settings()))


@lru_cache
def get_storage() -> LocalStorage:
    return LocalStorage(get_settings().storage_dir)


def get_app_settings() -> Settings:
    return get_settings()


# --------------------------------------------------------------------------- #
# 认证与租户依赖
# --------------------------------------------------------------------------- #

def token_from_header(authorization: str | None) -> str:
    if not authorization:
        raise AppError("UNAUTHORIZED", "请先登录", 401)
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError("UNAUTHORIZED", "登录状态无效", 401)
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthUser:
    """解析 Bearer token → 当前登录用户。无效/过期抛 401，停用抛 403。"""
    token = token_from_header(authorization)
    user = AuthService(settings).get_user_by_token(db, token)
    if not user:
        raise AppError("UNAUTHORIZED", "登录状态已过期，请重新登录", 401)
    if user.status != "active":
        raise AppError("FORBIDDEN", "账号已被停用", 403)
    return user


def require_super_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_SUPER_ADMIN:
        raise AppError("FORBIDDEN", "需要超级管理员权限", 403)
    return user


def require_reviewer(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if not can_review(user):
        raise AppError("FORBIDDEN", "仅企业管理层或独立个人可执行审核操作", 403)
    return user


def tenant_scope(user: AuthUser) -> str | None:
    """当前用户的数据隔离范围：member 返回其 tenant_id；super_admin 返回 None（不限租户）。"""
    return None if user.role == ROLE_SUPER_ADMIN else user.tenant_id
