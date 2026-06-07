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
    _ensure_schema_columns()


# create_all 不会给【已存在的表】补新增列；这里集中声明需要补的列（SQLite 风格 DDL，
# 其它方言由 _pg_ddl 翻译）。SQLite 与 PostgreSQL 升级老库都会走这套轻量迁移。
_TENANT_COL = "VARCHAR(36)"
_COLUMN_ADDITIONS: dict[str, dict[str, str]] = {
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
        "tenant_id": _TENANT_COL,
    },
    "report_quality_checks": {"tenant_id": _TENANT_COL},
    "auth_users": {
        "display_name": "VARCHAR(80) DEFAULT '张晓明'",
        "role": "VARCHAR(40) DEFAULT 'member'",
        "status": "VARCHAR(20) DEFAULT 'active'",
        "last_login_at": "DATETIME",
        "tenant_id": _TENANT_COL,
        "user_type": "VARCHAR(40) DEFAULT 'individual'",
    },
    "assistant_conversations": {"tenant_id": _TENANT_COL},
    "assistant_messages": {
        "tenant_id": _TENANT_COL,
        "attachments": "JSON DEFAULT '[]'",
        "deposited_source_id": "VARCHAR(36)",
        "deposited_at": "DATETIME",
    },
    "assistant_files": {
        "tenant_id": _TENANT_COL,
        "deposited_source_id": "VARCHAR(36)",
        "deposited_at": "DATETIME",
    },
    "expansion_sources": {"tenant_id": _TENANT_COL},
    "expansion_chunks": {"tenant_id": _TENANT_COL},
    "expansion_items": {"tenant_id": _TENANT_COL},
    "review_tasks": {"tenant_id": _TENANT_COL},
    "tasks": {"tenant_id": _TENANT_COL},
    "agent_runs": {"tenant_id": _TENANT_COL},
}


def _pg_ddl(sqlite_ddl: str) -> str:
    """把 SQLite 风格 DDL 翻译为 PostgreSQL（JSON→JSONB、DATETIME→TIMESTAMP）。"""
    return (
        sqlite_ddl.replace("JSON DEFAULT '[]'", "JSONB DEFAULT '[]'::jsonb")
        .replace("JSON DEFAULT '{}'", "JSONB DEFAULT '{}'::jsonb")
        .replace("DATETIME", "TIMESTAMP")
    )


def _ensure_schema_columns() -> None:
    """轻量迁移：给已存在的表补新增列（SQLite 与 PostgreSQL 均自愈，幂等）。"""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        _ensure_sqlite_columns()
    elif dialect == "postgresql":
        _ensure_postgres_columns()
    # 其它方言（如测试用内存库）跳过，由 create_all 负责建表。


def _ensure_sqlite_columns() -> None:
    with engine.begin() as conn:
        tables = {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        for table, additions in _COLUMN_ADDITIONS.items():
            if table not in tables:
                continue
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for column, ddl in additions.items():
                if column not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def _ensure_postgres_columns() -> None:
    # PostgreSQL 9.6+ 支持 ADD COLUMN IF NOT EXISTS，幂等且无需先行内省。
    with engine.begin() as conn:
        for table, additions in _COLUMN_ADDITIONS.items():
            for column, ddl in additions.items():
                conn.exec_driver_sql(
                    f"ALTER TABLE IF EXISTS {table} "
                    f"ADD COLUMN IF NOT EXISTS {column} {_pg_ddl(ddl)}"
                )
