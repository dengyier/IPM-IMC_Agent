"""SQLAlchemy 声明式基类与通用列类型。"""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


# PostgreSQL 用 JSONB，其它（SQLite）回退到通用 JSON
JsonType = JSON().with_variant(JSONB, "postgresql")


def uid() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)
