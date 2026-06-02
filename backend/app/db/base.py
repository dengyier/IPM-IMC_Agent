"""SQLAlchemy 声明式基类与通用列类型。"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


# PostgreSQL 用 JSONB，其它（SQLite）回退到通用 JSON
JsonType = JSON().with_variant(JSONB, "postgresql")
APP_TIMEZONE = timezone(timedelta(hours=8), name="Asia/Shanghai")


def uid() -> str:
    return str(uuid4())


def app_now() -> datetime:
    """系统统一使用东八区北京时间，并以无时区 datetime 落库。"""
    return datetime.now(APP_TIMEZONE).replace(tzinfo=None)


def utc_now() -> datetime:
    """兼容既有模型命名；实际返回系统统一的东八区时间。"""
    return app_now()
