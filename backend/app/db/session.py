from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base

settings = get_settings()
connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(
    settings.database_url, connect_args=connect_args, pool_pre_ping=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # 确保所有 model 被注册到 Base.metadata
    from app.db import models  # noqa: F401

    # SQLite 本地回退时确保目录存在
    if settings.database_url.startswith("sqlite"):
        from pathlib import Path

        db_path = settings.database_url.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_schema()


def _ensure_sqlite_schema() -> None:
    """本地 SQLite 轻量迁移：create_all 不会给已有表补新增列。"""
    if not settings.database_url.startswith("sqlite"):
        return
    tenant_col = "VARCHAR(36)"
    additions_by_table = {
        "diagnosis_reports": {
            "report_depth": "VARCHAR(40) DEFAULT 'consulting'",
            "executive_summary": "JSON DEFAULT '{}'",
            "core_tensions": "JSON DEFAULT '[]'",
            "cross_canvas_logic": "JSON DEFAULT '[]'",
            "unit_economics": "JSON DEFAULT '{}'",
            "risk_matrix": "JSON DEFAULT '[]'",
            "mvp_validation_path": "JSON DEFAULT '[]'",
            "ninety_day_plan": "JSON DEFAULT '{}'",
            "final_recommendation": "JSON DEFAULT '{}'",
            "tenant_id": tenant_col,
        },
        "report_quality_checks": {"tenant_id": tenant_col},
        "auth_users": {
            "display_name": "VARCHAR(80) DEFAULT '张晓明'",
            "role": "VARCHAR(40) DEFAULT 'member'",
            "status": "VARCHAR(20) DEFAULT 'active'",
            "last_login_at": "DATETIME",
            "tenant_id": tenant_col,
            "user_type": "VARCHAR(40) DEFAULT 'individual'",
        },
        "assistant_conversations": {"tenant_id": tenant_col},
        "assistant_messages": {
            "tenant_id": tenant_col,
            "attachments": "JSON DEFAULT '[]'",
        },
        "expansion_sources": {"tenant_id": tenant_col},
        "expansion_chunks": {"tenant_id": tenant_col},
        "expansion_items": {"tenant_id": tenant_col},
        "review_tasks": {"tenant_id": tenant_col},
        "tasks": {"tenant_id": tenant_col},
        "agent_runs": {"tenant_id": tenant_col},
    }
    with engine.begin() as conn:
        tables = {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}
        for table, additions in additions_by_table.items():
            if table not in tables:
                continue
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for column, ddl in additions.items():
                if column not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
