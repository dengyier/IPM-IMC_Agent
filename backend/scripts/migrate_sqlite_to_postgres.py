"""把本地 SQLite 业务数据迁移到生产 PostgreSQL。

用途：
    python scripts/migrate_sqlite_to_postgres.py \
      --source sqlite:///./data/imc_ipm.db \
      --target postgresql+psycopg://user:password@host:5432/db

默认行为是跳过目标库已存在主键的数据，适合重复执行校验。
首次迁移到一个空的生产库时，也可以加 --replace 清空目标库后重灌。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import Engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import Base  # noqa: E402
from app.db.models import *  # noqa: F403,E402 确保所有模型注册到 Base.metadata


DEFAULT_SOURCE = "sqlite:///./data/imc_ipm.db"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate local SQLite data to PostgreSQL.")
    parser.add_argument(
        "--source",
        default=os.environ.get("SOURCE_DATABASE_URL", DEFAULT_SOURCE),
        help="源 SQLite DATABASE_URL，默认 sqlite:///./data/imc_ipm.db",
    )
    parser.add_argument(
        "--target",
        default=os.environ.get("TARGET_DATABASE_URL"),
        help="目标 PostgreSQL DATABASE_URL，也可通过 TARGET_DATABASE_URL 提供",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="危险操作：先清空目标库中本系统所有表，再导入源库数据",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只读取源 SQLite 并打印各表行数，不写入目标库",
    )
    return parser.parse_args()


def _engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def _existing_primary_keys(target: Engine, table) -> set[Any]:
    pk_columns = list(table.primary_key.columns)
    if len(pk_columns) != 1:
        return set()
    pk = pk_columns[0]
    with target.connect() as conn:
        return {row[0] for row in conn.execute(select(pk)).all()}


def migrate(source_url: str, target_url: str | None, replace: bool = False, dry_run: bool = False) -> None:
    if not target_url and not dry_run:
        raise SystemExit("缺少 --target 或 TARGET_DATABASE_URL。")
    if target_url and source_url == target_url:
        raise SystemExit("源数据库和目标数据库相同，已停止迁移。")
    if not source_url.startswith("sqlite"):
        raise SystemExit("当前脚本只用于从 SQLite 迁移到 PostgreSQL。")
    if target_url and not target_url.startswith("postgres"):
        raise SystemExit("目标数据库必须是 PostgreSQL。")

    source = _engine(source_url)
    if dry_run:
        total = 0
        for table in Base.metadata.sorted_tables:
            with source.connect() as conn:
                rows = conn.execute(select(table)).all()
            total += len(rows)
            print(f"{table.name}: {len(rows)} 行。")
        print(f"Dry run 完成：源库共 {total} 行，不写入目标库。")
        return

    target = _engine(target_url)
    Base.metadata.create_all(bind=target)

    tables = Base.metadata.sorted_tables

    if replace:
        print("已启用 --replace：将清空目标库本系统表后重新导入。")
        with target.begin() as conn:
            for table in reversed(tables):
                conn.execute(delete(table))

    total_inserted = 0
    for table in tables:
        with source.connect() as conn:
            rows = [dict(row._mapping) for row in conn.execute(select(table)).all()]
        if not rows:
            print(f"{table.name}: 源库无数据，跳过。")
            continue

        existing_keys = set() if replace else _existing_primary_keys(target, table)
        pk_columns = list(table.primary_key.columns)
        pk_name = pk_columns[0].name if len(pk_columns) == 1 else None
        if pk_name and existing_keys:
            rows = [row for row in rows if row.get(pk_name) not in existing_keys]

        if not rows:
            print(f"{table.name}: 目标库已存在，跳过。")
            continue

        with target.begin() as conn:
            conn.execute(table.insert(), rows)
        total_inserted += len(rows)
        print(f"{table.name}: 导入 {len(rows)} 行。")

    print(f"迁移完成：新增 {total_inserted} 行。")


if __name__ == "__main__":
    args = _parse_args()
    migrate(args.source, args.target, args.replace, args.dry_run)
