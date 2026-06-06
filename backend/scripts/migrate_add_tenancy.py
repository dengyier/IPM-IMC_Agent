"""V2 多租户迁移：加列 + 建租户表 + 回填 + 落地超级管理员。

幂等、SQLite / PostgreSQL 通用。可反复执行。

用法（容器内）：
    docker compose exec api python scripts/migrate_add_tenancy.py
本地：
    NO_PROXY=localhost,127.0.0.1 .venv/bin/python scripts/migrate_add_tenancy.py

做的事：
1) 建 tenants 表 + 给私有表/auth_users 补 tenant_id / user_type 等列。
2) 建一个「默认组织」租户，把历史私有数据（报告/会话/扩展/任务等）回填到该租户。
3) 规范化用户角色：超级管理员手机号 → super_admin（无租户）；其余 → member + 默认租户。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime  # noqa: E402

from sqlalchemy import text  # noqa: E402

from app.db.base import uid  # noqa: E402
from app.db.session import engine, init_db  # noqa: E402
from app.services.auth_service import (  # noqa: E402
    ROLE_MEMBER,
    ROLE_SUPER_ADMIN,
    SUPER_ADMIN_PHONE,
    USER_TYPE_INDIVIDUAL,
)

DEFAULT_TENANT_ID = "default-tenant"

# 私有表 → 需要回填 tenant_id 的表
PRIVATE_TABLES = [
    "diagnosis_reports",
    "report_quality_checks",
    "assistant_conversations",
    "assistant_messages",
    "expansion_sources",
    "expansion_chunks",
    "expansion_items",
    "review_tasks",
    "tasks",
    "agent_runs",
]

# 每张表要确保存在的列（仅 Postgres 用；SQLite 由 init_db 的 _ensure_sqlite_schema 处理）
COLUMNS = {
    "auth_users": [("tenant_id", "VARCHAR(36)"), ("user_type", "VARCHAR(40)")],
    **{t: [("tenant_id", "VARCHAR(36)")] for t in PRIVATE_TABLES},
}


def _is_sqlite() -> bool:
    return engine.dialect.name == "sqlite"


def _ensure_columns_postgres(conn) -> None:
    for table, cols in COLUMNS.items():
        for name, ddl in cols:
            conn.exec_driver_sql(
                f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl}'
            )


def run() -> None:
    # 1) 建表（含 tenants）；SQLite 同时补列
    init_db()
    now = datetime.utcnow()

    with engine.begin() as conn:
        # 2) Postgres 补列（SQLite 已由 init_db 处理）
        if not _is_sqlite():
            _ensure_columns_postgres(conn)

        # 3) 默认租户
        exists = conn.execute(
            text("SELECT id FROM tenants WHERE id = :id"), {"id": DEFAULT_TENANT_ID}
        ).first()
        if not exists:
            conn.execute(
                text(
                    "INSERT INTO tenants (id, name, type, status, created_at, updated_at) "
                    "VALUES (:id, :name, :type, 'active', :now, :now)"
                ),
                {
                    "id": DEFAULT_TENANT_ID,
                    "name": "默认组织",
                    "type": "enterprise",
                    "now": now,
                },
            )
            print(f"已创建默认租户 {DEFAULT_TENANT_ID}（默认组织）")
        else:
            print(f"默认租户已存在 {DEFAULT_TENANT_ID}")

        # 4) 回填历史私有数据到默认租户
        for table in PRIVATE_TABLES:
            res = conn.execute(
                text(
                    f"UPDATE {table} SET tenant_id = :tid "
                    f"WHERE tenant_id IS NULL OR tenant_id = ''"
                ),
                {"tid": DEFAULT_TENANT_ID},
            )
            if res.rowcount:
                print(f"  {table}: 回填 {res.rowcount} 行 → 默认租户")

        # 5) 规范化用户
        #    超级管理员：role=super_admin，无租户
        admin = conn.execute(
            text("SELECT id FROM auth_users WHERE phone = :p"),
            {"p": SUPER_ADMIN_PHONE},
        ).first()
        if admin:
            conn.execute(
                text(
                    "UPDATE auth_users SET role = :r, tenant_id = NULL WHERE phone = :p"
                ),
                {"r": ROLE_SUPER_ADMIN, "p": SUPER_ADMIN_PHONE},
            )
            print(f"超级管理员 {SUPER_ADMIN_PHONE} 已落地 role=super_admin")
        else:
            # 预创建超级管理员账号（首次短信登录即生效）
            conn.execute(
                text(
                    "INSERT INTO auth_users "
                    "(id, phone, display_name, role, user_type, status, created_at, updated_at) "
                    "VALUES (:id, :phone, :name, :role, :ut, 'active', :now, :now)"
                ),
                {
                    "id": uid(),
                    "phone": SUPER_ADMIN_PHONE,
                    "name": "超级管理员",
                    "role": ROLE_SUPER_ADMIN,
                    "ut": USER_TYPE_INDIVIDUAL,
                    "now": now,
                },
            )
            print(f"已预创建超级管理员账号 {SUPER_ADMIN_PHONE}")

        #    其余用户：旧 role（如“管理员”）→ member；空 user_type → individual；空 tenant → 默认租户
        conn.execute(
            text(
                "UPDATE auth_users SET role = :member "
                "WHERE phone <> :admin AND role NOT IN (:member, :super)"
            ),
            {"member": ROLE_MEMBER, "super": ROLE_SUPER_ADMIN, "admin": SUPER_ADMIN_PHONE},
        )
        conn.execute(
            text(
                "UPDATE auth_users SET user_type = :ut "
                "WHERE user_type IS NULL OR user_type = ''"
            ),
            {"ut": USER_TYPE_INDIVIDUAL},
        )
        conn.execute(
            text(
                "UPDATE auth_users SET tenant_id = :tid "
                "WHERE phone <> :admin AND (tenant_id IS NULL OR tenant_id = '')"
            ),
            {"tid": DEFAULT_TENANT_ID, "admin": SUPER_ADMIN_PHONE},
        )
        print("用户角色/身份/租户已规范化")

    print("\n多租户迁移完成。")
    print("注意：历史 expansion 向量未带 tenant_id，如需按租户检索请重跑 rebuild_vector_collections。")


if __name__ == "__main__":
    run()
