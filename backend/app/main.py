"""FastAPI 应用入口 —— 天机AI 商业决策智能体后端。

Phase 1：方法论底座（核心方法论 → 节点 → 关系 → 路由规则）。
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import install_error_handlers
from app.api.routers import (
    assistant,
    auth,
    dashboard,
    diagnosis,
    expansion,
    feedback,
    methodology,
    project,
    system,
    tasks,
    validation,
)
from app.core.config import get_settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_error_handlers(app)

    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(tasks.router)
    app.include_router(assistant.router)
    app.include_router(dashboard.router)
    app.include_router(methodology.router)
    app.include_router(expansion.router)
    app.include_router(expansion.review_router)
    app.include_router(diagnosis.router)
    app.include_router(feedback.router)
    app.include_router(project.router)
    app.include_router(validation.router)

    @app.get("/")
    def root() -> dict:
        return {"app": settings.app_name, "status": "ok", "phase": "1-methodology-kernel"}

    return app


app = create_app()
