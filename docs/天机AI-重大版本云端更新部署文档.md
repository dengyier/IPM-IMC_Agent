# 天机AI 重大版本云端更新部署文档

> 文档版本：v1.0  
> 更新日期：2026-06-12  
> 适用场景：将本次“经营工作台 + 完整验证卡 + BACH 冷酷审判 + 文件上传资料中心联动”等重大改动更新到云端服务器  
> 核心原则：**先备份、再构建、后切换；绝不删除生产数据卷；绝不在未确认数据位置前重启数据库或清空目录。**

---

## 1. 本次更新概述

本次更新不是普通样式调整，而是一次产品主线重构。系统从“AI 商业决策智能体 / 商业诊断工具”进一步升级为：

> **企业重大投入前的 7 天商业验证系统。**

主要新增或大幅调整内容包括：

1. 经营工作台首页。
2. 未来 30 天投入决策入口。
3. 上传主流文件与图片作为验证材料。
4. 上传材料同步资料中心。
5. 7 天验证卡生成。
6. 验证卡动作从固定模板升级为可深度展开的决策树节点。
7. 节点动态证据目标 `evidence_target`。
8. 缺失证据统计。
9. 完整验证卡详情页。
10. 节点证据入账。
11. 节点完成操作。
12. Day 7 复盘。
13. AI 经营访谈读取验证卡上下文。
14. BACH 假设树引擎。
15. BACH 异构模型证据评审。
16. BACH 证据账本。
17. BACH 冷酷审判详情页。
18. 敏感性 `impact_weight`。
19. 蒙特卡洛量化沙盘。
20. 决策病例库基础接口。

因此，本次上线必须按“重大版本更新”处理，重点保护：

- 线上用户账号与会话。
- 线上项目数据。
- 线上诊断报告。
- 线上验证卡。
- 线上资料中心数据。
- 上传文件。
- Qdrant 向量库。
- `.env` 密钥配置。
- 当前可用镜像与代码版本。

---

## 2. 线上数据保护红线

以下命令在生产服务器上禁止使用，除非已经完成离线备份且明确要重建环境：

```bash
docker compose down -v
docker volume rm ...
rm -rf /opt/imc-migration
rm -rf backend/data
rm -rf /data/uploads
docker system prune -a --volumes
git reset --hard
```

尤其注意：

- `docker compose down` 本身不会删除卷。
- `docker compose down -v` 会删除卷，生产环境禁用。
- `docker system prune -a` 不一定删除卷。
- `docker system prune -a --volumes` 会删除未使用卷，生产环境禁用。

---

## 3. 当前部署结构确认

### 3.0 线上服务器实测结论（2026-06-12）

已对当前线上服务器 `8.217.223.92` 做只读检查，结论如下：

| 项目 | 线上实际情况 |
|---|---|
| 源码拉取目录 | `/data/IPM-IMC_Agent` |
| 实际部署目录 | `/home/opc/imc-agent` |
| 源码当前 commit | `30c6932` |
| 源码分支 | `main` |
| 部署目录是否完整 git 仓库 | 否，主要通过文件拷贝更新 |
| API 容器 | `imc-agent-api-1`，运行中且 healthy |
| 前端容器 | `imc-agent-frontend-1`，运行中 |
| PostgreSQL 容器 | `imc-agent-postgres-1`，运行中但当前 API 未使用 |
| Qdrant 容器 | `imc-agent-qdrant-1`，运行中 |
| API 对外端口 | `18005` |
| 前端对外端口 | `13005` |
| 当前数据库 | SQLite |
| SQLite 文件 | `/opt/imc-migration/imc_ipm.db` |
| SQLite 文件大小 | 约 13MB |
| SQLite 完整性 | `PRAGMA integrity_check = ok` |
| 上传文件卷 | `imc-agent_upload_data` |
| Qdrant 卷 | `imc-agent_qdrant_data` |
| PostgreSQL 卷 | `imc-agent_postgres_data` |

线上现有核心表计数：

| 表 | 数量 |
|---|---:|
| `auth_users` | 25 |
| `assistant_conversations` | 22 |
| `assistant_messages` | 108 |
| `assistant_files` | 4 |
| `diagnosis_reports` | 12 |
| `expansion_sources` | 21 |
| `expansion_chunks` | 161 |
| `methodology_nodes` | 1214 |
| `methodology_edges` | 1947 |
| `review_tasks` | 532 |
| `feedbacks` | 2 |

当前线上尚不存在的新版本表：

- `projects`
- `validation_cards`
- `tianji_hypotheses`
- `tianji_evidence_ledger`
- `tianji_predictions`

这说明线上仍是旧版本数据结构。新代码首次启动时会通过 `init_db()` 自动创建这些新表。上线后需要确认这些表已经创建成功。

### 3.1 当前 `docker-compose.yml` 的实际情况

当前仓库根目录的 `docker-compose.yml` 同时定义了：

- `postgres`
- `qdrant`
- `api`
- `frontend`

但需要特别注意：当前 `api` 容器里强制设置了：

```yaml
DATABASE_URL: sqlite:///./data/imc_ipm.db
STORAGE_DIR: /data/uploads
volumes:
  - upload_data:/data/uploads
  - /opt/imc-migration:/app/data
```

这意味着：

1. 虽然 postgres 容器存在，但当前 API 实际可能使用 SQLite。
2. SQLite 数据库文件在容器内路径是 `/app/data/imc_ipm.db`。
3. 因为 `/opt/imc-migration:/app/data`，宿主机实际数据文件大概率是：

```bash
/opt/imc-migration/imc_ipm.db
```

4. 上传文件在 Docker 卷 `upload_data` 中，对应容器路径：

```bash
/data/uploads
```

5. Qdrant 向量数据在 Docker 卷 `qdrant_data` 中。

### 3.2 本次上线不要顺手切换数据库

本次目标是安全更新大版本代码，不建议同时做 SQLite → PostgreSQL 数据迁移。

原因：

- 本次业务改动已经很大。
- 数据库迁移会引入额外风险。
- 当前代码具备 SQLite 轻量迁移能力。
- 先保持线上数据库模式不变，更容易回滚。

建议：

> 本次只做代码更新和自动轻量 schema 升级。数据库从 SQLite 切 PostgreSQL 应另开一次专门迁移窗口。

### 3.3 不建议继续使用原始 `cp -r *` 更新方式

当前常用更新方式是：

```bash
cp -r /data/IPM-IMC_Agent/* /home/opc/imc-agent/
docker compose down
sleep 30
docker compose up -d --build
```

这个方式有两个优点：

- 不会复制 `.env`，因此通常不会覆盖线上密钥。
- 简单直接。

但在本次重大版本更新中，它有三个风险：

1. `*` 不包含点文件，行为依赖 shell 规则，不够明确。
2. `cp -r` 不会删除线上已经废弃的旧文件，可能留下旧页面、旧组件、旧配置。
3. `docker compose down` 会中断全部服务，虽然不会删除卷，但不是最小影响更新。

本次更推荐使用 `rsync`，并明确排除线上配置和数据：

```bash
rsync -a --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='backend/data/' \
  /data/IPM-IMC_Agent/ \
  /home/opc/imc-agent/
```

上线前先 dry-run：

```bash
rsync -a --delete --dry-run \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='backend/data/' \
  /data/IPM-IMC_Agent/ \
  /home/opc/imc-agent/
```

确认 dry-run 输出没有误删关键文件后，再执行正式 rsync。

注意：`.env` 必须保留线上版本，不能从仓库覆盖。

---

## 4. 更新前检查清单

在服务器上执行：

```bash
cd /opt/imc-ipm-agent
pwd
git branch --show-current
git rev-parse --short HEAD
docker compose ps
docker volume ls | grep -E "imc|qdrant|upload|postgres"
```

记录以下信息：

| 检查项 | 命令 | 需要记录 |
|---|---|---|
| 当前代码目录 | `pwd` | 例如 `/opt/imc-ipm-agent` |
| 当前分支 | `git branch --show-current` | 例如 `main` |
| 当前 commit | `git rev-parse --short HEAD` | 回滚用 |
| 当前容器状态 | `docker compose ps` | 哪些服务正在运行 |
| 当前卷名 | `docker volume ls` | 备份用 |
| 当前数据库模式 | `docker compose exec api python -c ...` | sqlite 或 postgresql |

确认 API 当前数据库连接：

```bash
docker compose exec api python - <<'PY'
from app.core.config import get_settings
s = get_settings()
print("DATABASE_URL =", s.database_url)
print("STORAGE_DIR =", s.storage_dir)
print("QDRANT_URL =", s.qdrant_url)
print("EMBEDDING_DIM =", s.embedding_dim)
PY
```

如果输出中包含：

```text
DATABASE_URL = sqlite:///./data/imc_ipm.db
```

则按本文档的 SQLite 保护路径执行。

如果输出中包含：

```text
postgresql://...
postgresql+psycopg://...
```

则同时执行 PostgreSQL 备份。

---

## 5. 更新前完整备份

### 5.1 创建备份目录

```bash
cd /opt/imc-ipm-agent
TS=$(date +%F_%H%M%S)
BACKUP_DIR=/opt/imc-backups/tianji_major_update_$TS
mkdir -p "$BACKUP_DIR"
echo "$BACKUP_DIR"
```

### 5.2 备份当前代码版本与配置

```bash
git rev-parse HEAD > "$BACKUP_DIR/git_commit.txt"
git branch --show-current > "$BACKUP_DIR/git_branch.txt"
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
cp .env "$BACKUP_DIR/.env"
cp -r deploy "$BACKUP_DIR/deploy"
```

> `.env` 含密钥，备份目录权限应限制为服务器管理员可读。

建议设置权限：

```bash
chmod -R go-rwx "$BACKUP_DIR"
```

### 5.3 备份 SQLite 数据库

当前 compose 极可能使用 SQLite，必须优先备份：

```bash
if [ -f /opt/imc-migration/imc_ipm.db ]; then
  cp /opt/imc-migration/imc_ipm.db "$BACKUP_DIR/imc_ipm.db"
  sqlite3 /opt/imc-migration/imc_ipm.db ".backup '$BACKUP_DIR/imc_ipm_sqlite_backup.db'"
  sqlite3 /opt/imc-migration/imc_ipm.db "PRAGMA integrity_check;" > "$BACKUP_DIR/sqlite_integrity_check.txt"
else
  echo "未发现 /opt/imc-migration/imc_ipm.db，请检查实际 DATABASE_URL" | tee "$BACKUP_DIR/sqlite_missing.txt"
fi
```

如果服务器没有 `sqlite3` 命令，可安装：

```bash
sudo apt update
sudo apt install -y sqlite3
```

也可以在 api 容器内检查：

```bash
docker compose exec api python - <<'PY' > "$BACKUP_DIR/sqlite_table_counts.txt"
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
tables = ["auth_users", "projects", "assistant_conversations", "assistant_messages", "assistant_files", "validation_cards", "diagnosis_reports", "expansion_sources"]
for table in tables:
    try:
        n = db.execute(text(f"select count(*) from {table}")).scalar()
        print(table, n)
    except Exception as e:
        print(table, "ERR", e)
db.close()
PY
```

### 5.4 备份 PostgreSQL

如果当前生产确实在用 PostgreSQL，则执行：

```bash
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-imc}" \
  "${POSTGRES_DB:-imc_ipm}" \
  > "$BACKUP_DIR/postgres.sql"
```

即使当前 API 没用 PostgreSQL，也可以备份一次，避免里面有历史数据：

```bash
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-imc}" \
  "${POSTGRES_DB:-imc_ipm}" \
  > "$BACKUP_DIR/postgres_optional.sql" || true
```

### 5.5 备份上传文件卷

先确认实际卷名：

```bash
docker volume ls | grep upload
```

一般卷名可能类似：

```text
imc-ipm-agent_upload_data
```

备份：

```bash
UPLOAD_VOL=$(docker volume ls --format '{{.Name}}' | grep 'upload_data' | head -n 1)
echo "$UPLOAD_VOL" > "$BACKUP_DIR/upload_volume_name.txt"

docker run --rm \
  -v "$UPLOAD_VOL":/data \
  -v "$BACKUP_DIR":/backup \
  alpine sh -c "tar czf /backup/uploads.tar.gz -C /data ."
```

### 5.6 备份 Qdrant 向量卷

确认卷名：

```bash
docker volume ls | grep qdrant
```

备份：

```bash
QDRANT_VOL=$(docker volume ls --format '{{.Name}}' | grep 'qdrant_data' | head -n 1)
echo "$QDRANT_VOL" > "$BACKUP_DIR/qdrant_volume_name.txt"

docker run --rm \
  -v "$QDRANT_VOL":/data \
  -v "$BACKUP_DIR":/backup \
  alpine sh -c "tar czf /backup/qdrant.tar.gz -C /data ."
```

### 5.7 导出更新前数据计数

这一步用于上线后对比，确认数据没有丢。

```bash
docker compose exec api python - <<'PY' > "$BACKUP_DIR/pre_update_counts.txt"
from app.db.session import SessionLocal
from sqlalchemy import text

tables = [
    "auth_users",
    "projects",
    "assistant_conversations",
    "assistant_messages",
    "assistant_files",
    "validation_cards",
    "diagnosis_reports",
    "expansion_sources",
    "expansion_chunks",
    "methodology_nodes",
    "methodology_edges",
]

db = SessionLocal()
for table in tables:
    try:
        count = db.execute(text(f"select count(*) from {table}")).scalar()
        print(f"{table}: {count}")
    except Exception as exc:
        print(f"{table}: ERR {exc}")
db.close()
PY

cat "$BACKUP_DIR/pre_update_counts.txt"
```

### 5.8 备份完成确认

检查备份文件：

```bash
ls -lah "$BACKUP_DIR"
du -sh "$BACKUP_DIR"
```

最低要求：

- 有 `.env`。
- 有 `docker-compose.yml`。
- 有当前 commit。
- 有 SQLite 或 PostgreSQL 备份。
- 有 uploads 压缩包。
- 有 qdrant 压缩包。
- 有更新前数据计数。

---

## 6. 本地或服务器预构建检查

### 6.1 服务器拉取代码前先确认工作区

```bash
cd /opt/imc-ipm-agent
git status --short
```

如果服务器上有未提交改动，先备份：

```bash
git diff > "$BACKUP_DIR/server_uncommitted.diff"
git status --short > "$BACKUP_DIR/server_git_status.txt"
```

不建议直接 `git reset --hard`，除非确认这些改动不需要。

### 6.2 拉取代码

```bash
git fetch origin
git log --oneline --decorate -5
```

如果要更新 `main`：

```bash
git pull origin main
```

如果要部署指定分支：

```bash
git checkout <branch-name>
git pull origin <branch-name>
```

记录新 commit：

```bash
git rev-parse HEAD > "$BACKUP_DIR/new_git_commit.txt"
```

### 6.3 构建镜像但暂不重启数据容器

```bash
docker compose build api frontend
```

如使用 Nginx：

```bash
docker compose build nginx || true
```

> 如果当前 compose 没有 nginx 服务，上面会失败，忽略即可。

---

## 7. 上线执行流程

### 7.1 推荐上线窗口

建议选择低峰时段，提前通知内部使用者：

- 上线窗口：10 到 20 分钟。
- 影响范围：前端短暂刷新、API 短暂重启。
- 数据库和向量库不停止或尽量不停止。

### 7.2 保持数据服务运行，只替换应用服务

推荐顺序：

```bash
cd /opt/imc-ipm-agent

# 1. 先启动或刷新后端代码
docker compose up -d --no-deps api

# 2. 查看后端启动日志
docker compose logs -f --tail=200 api
```

看到类似以下信息后继续：

```text
Application startup complete
```

然后更新前端：

```bash
docker compose up -d --no-deps frontend
docker compose logs -f --tail=100 frontend
```

如果有 nginx 服务：

```bash
docker compose up -d --no-deps nginx
```

如果想让 compose 自动处理依赖，也可以执行：

```bash
docker compose up -d
```

但不要执行：

```bash
docker compose down -v
```

### 7.3 如果需要强制重建并启动

在已完成完整备份的前提下：

```bash
docker compose up -d --build api frontend
```

此命令不会删除数据卷。

---

## 8. 数据库 schema 升级说明

### 8.1 当前代码的轻量迁移机制

后端启动时会执行：

- `Base.metadata.create_all(bind=engine)`：创建新表。
- `_ensure_schema_columns()`：给已有表补新增列。

本次新增能力涉及以下表或字段：

#### 新表

- `tianji_hypotheses`
- `tianji_evidence_ledger`
- `tianji_predictions`

#### 可能补列的已有表

- `validation_cards`
- `assistant_messages`
- `assistant_files`
- `diagnosis_reports`
- `projects`
- `expansion_sources`
- `expansion_chunks`

### 8.2 自动迁移的安全性

当前迁移策略是“只新增表、只新增列”，不会主动删除表、删除列或清空数据。

因此，正常启动后会：

- 保留原用户。
- 保留原会话。
- 保留原报告。
- 保留原资料。
- 保留原验证卡。
- 新增 BACH 所需表。
- 给旧表补齐新字段。

### 8.3 上线后确认新增表

SQLite 模式下：

```bash
docker compose exec api python - <<'PY'
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
for table in ["tianji_hypotheses", "tianji_evidence_ledger", "tianji_predictions"]:
    try:
        print(table, db.execute(text(f"select count(*) from {table}")).scalar())
    except Exception as exc:
        print(table, "ERR", exc)
db.close()
PY
```

PostgreSQL 模式下也可用同一命令。

---

## 9. 上线后健康检查

### 9.1 容器状态

```bash
docker compose ps
docker compose logs --tail=120 api
docker compose logs --tail=80 frontend
```

确认：

- `api` 运行中。
- `frontend` 运行中。
- `qdrant` 运行中。
- 如用 postgres，`postgres` healthy。
- 日志中无持续报错。

### 9.2 API 健康检查

```bash
curl -I http://127.0.0.1:18005/docs
curl -I http://127.0.0.1:13005
```

如果走 Nginx：

```bash
curl -I http://127.0.0.1/
curl -I http://127.0.0.1/docs
```

### 9.3 系统状态接口

```bash
curl http://127.0.0.1:18005/api/system/status
```

如接口路径不同，可访问：

```bash
curl http://127.0.0.1:18005/docs
```

手动在 Swagger 中检查 system、validation-cards、workbench、tianji-bach 接口。

### 9.4 数据计数对比

上线后导出数据计数：

```bash
docker compose exec api python - <<'PY' > "$BACKUP_DIR/post_update_counts.txt"
from app.db.session import SessionLocal
from sqlalchemy import text

tables = [
    "auth_users",
    "projects",
    "assistant_conversations",
    "assistant_messages",
    "assistant_files",
    "validation_cards",
    "diagnosis_reports",
    "expansion_sources",
    "expansion_chunks",
    "methodology_nodes",
    "methodology_edges",
    "tianji_hypotheses",
    "tianji_evidence_ledger",
    "tianji_predictions",
]

db = SessionLocal()
for table in tables:
    try:
        count = db.execute(text(f"select count(*) from {table}")).scalar()
        print(f"{table}: {count}")
    except Exception as exc:
        print(f"{table}: ERR {exc}")
db.close()
PY

cat "$BACKUP_DIR/pre_update_counts.txt"
cat "$BACKUP_DIR/post_update_counts.txt"
```

要求：

- 老表数据数量不应减少。
- 新表初始为 0 是正常的。
- 创建新验证卡后，新表会增加记录。

---

## 10. 功能验收清单

### 10.1 登录与基础页面

浏览器访问线上地址，确认：

- 登录页可打开。
- 验证码登录正常。
- 左侧导航正常。
- 经营工作台可打开。
- AI 经营访谈可打开。
- 资料中心可打开。
- 经营档案可打开。

### 10.2 经营工作台

测试：

1. 输入：

```text
我有一个产品/服务，但不知道目标客户是否愿意付费。
```

2. 点击“开始 7 天验证”。

预期：

- 成功生成验证卡。
- 页面展示当前验证任务。
- 展示 7 天时间线。
- 展示决策树节点。
- 展示证据目标，不应全部固定为 3。
- 右侧出现冷酷审判。
- 右侧出现证据状态。
- 出现“查看完整验证卡”。

### 10.3 完整验证卡

测试：

- 点击“查看完整验证卡”。

预期：

- 进入 `/validation-cards/[cardId]`。
- 页面标题为“完整验证卡”。
- 展示任务摘要。
- 展示 7 天时间轴。
- 展示完整决策树节点。
- 节点可以录入证据。
- 节点可以标记完成。
- 证据中心能看到入账证据。
- Day 7 复盘表单存在。
- AI 经营访谈按钮可跳转。
- 冷酷审判按钮可跳转。

### 10.4 AI 经营访谈联动

测试：

- 从完整验证卡点击“AI经营访谈”。

预期：

- URL 包含 `validationCardId`。
- 如有 `projectId`，URL 也包含 `projectId`。
- 页面提示当前访谈会读取验证内容、决策树任务、证据状态和 BACH 审判结果。
- AI 不重新泛泛生成验证卡，而是围绕当前任务继续追问。

### 10.5 BACH 冷酷审判

测试：

- 从工作台或完整验证卡点击“冷酷审判”。

预期：

- 进入 `/bach/[cardId]`。
- 展示裁决。
- 展示假设树。
- 展示证据账本。
- 展示预测记录。
- 可以运行沙盘。
- 运行沙盘后结果可展示。

### 10.6 文件上传与资料中心

测试上传：

- `.docx`
- `.pdf`
- `.xlsx`
- `.png` 或 `.jpg`

预期：

- 文件可以上传。
- 文档类文件可以解析。
- 图片可以上传，并提示当前未启用 OCR / 视觉识别。
- 上传材料可以同步资料中心。
- 创建验证卡时材料摘要进入 brief。

### 10.7 复盘闭环

测试：

- 在完整验证卡中提交 Day 7 复盘。

预期：

- 验证卡状态更新。
- `result` 写入。
- `actual_outcome` 写入。
- `learnings` 写入。
- `validated_at` 写入。
- 经营档案可看到相关结果。

---

## 11. 回滚方案

### 11.1 只回滚代码，不回滚数据

适用于：

- 前端页面异常。
- API 新逻辑报错。
- 但数据库没有损坏，老数据仍完整。

执行：

```bash
cd /opt/imc-ipm-agent
OLD_COMMIT=$(cat "$BACKUP_DIR/git_commit.txt")
git checkout "$OLD_COMMIT"
docker compose build api frontend
docker compose up -d --no-deps api frontend
```

注意：

- 新版本启动时可能已经创建了新表或新增列。
- 旧代码通常会忽略多出来的表和列。
- 只要没有删除旧字段，代码回滚通常安全。

### 11.2 回滚代码和 SQLite 数据

适用于：

- 数据被错误写坏。
- 验证卡或会话出现大量异常写入。
- 必须恢复到上线前状态。

操作前先停 API，避免写入：

```bash
docker compose stop api frontend
```

恢复 SQLite：

```bash
cp "$BACKUP_DIR/imc_ipm.db" /opt/imc-migration/imc_ipm.db
```

恢复上传文件：

```bash
UPLOAD_VOL=$(cat "$BACKUP_DIR/upload_volume_name.txt")
docker run --rm \
  -v "$UPLOAD_VOL":/data \
  -v "$BACKUP_DIR":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/uploads.tar.gz -C /data"
```

恢复 Qdrant：

```bash
QDRANT_VOL=$(cat "$BACKUP_DIR/qdrant_volume_name.txt")
docker compose stop qdrant
docker run --rm \
  -v "$QDRANT_VOL":/data \
  -v "$BACKUP_DIR":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/qdrant.tar.gz -C /data"
docker compose start qdrant
```

恢复代码：

```bash
OLD_COMMIT=$(cat "$BACKUP_DIR/git_commit.txt")
git checkout "$OLD_COMMIT"
docker compose build api frontend
docker compose up -d api frontend
```

### 11.3 PostgreSQL 数据恢复

如果生产使用 PostgreSQL：

```bash
docker compose stop api frontend
cat "$BACKUP_DIR/postgres.sql" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-imc}" \
  "${POSTGRES_DB:-imc_ipm}"
docker compose up -d api frontend
```

恢复前建议先备份当前异常状态：

```bash
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-imc}" \
  "${POSTGRES_DB:-imc_ipm}" \
  > "$BACKUP_DIR/postgres_before_restore.sql"
```

---

## 12. 常见问题与处理

### 12.1 前端白屏，控制台报 `_next/static/chunks` 404

原因：

- 前端 build 后旧 dev / start 进程仍在。
- 浏览器缓存了旧 chunk。
- 容器没有被正确重建。

处理：

```bash
docker compose build frontend
docker compose up -d --no-deps frontend
docker compose logs --tail=100 frontend
```

浏览器强制刷新。

### 12.2 API 启动失败，提示某张表不存在

处理：

```bash
docker compose logs --tail=200 api
```

确认 `init_db()` 是否执行。

可进入容器手动执行一次导入初始化：

```bash
docker compose exec api python - <<'PY'
from app.db.session import init_db
init_db()
print("init db done")
PY
```

然后重启：

```bash
docker compose restart api
```

### 12.3 验证卡生成失败

检查：

- `DEEPSEEK_API_KEY` 是否配置。
- DeepSeek 网络是否可达。
- API 日志是否超时。

```bash
docker compose logs -f api
```

如果 DeepSeek 不可用，后端应有本地 fallback，但生成质量会下降。

### 12.4 BACH 没有假设树

可能原因：

- 验证卡创建时 BACH 初始化失败。
- LLM 不可用。
- 新表未创建成功。

处理：

1. 查看 API 日志。
2. 确认新表存在。
3. 新建一张验证卡测试。

### 12.5 文件上传失败

检查：

- Nginx `client_max_body_size`。
- API `STORAGE_DIR`。
- `upload_data` 卷权限。

```bash
docker compose exec api sh -c "ls -lah /data/uploads && touch /data/uploads/test_write && rm /data/uploads/test_write"
```

### 12.6 图片上传成功但没有识别内容

这是当前设计限制，不是部署故障。

当前图片只保存为附件，可沉淀到资料中心，但未启用 OCR / 视觉识别。正式验证前需用户补充图片里的关键信息。

### 12.7 Qdrant 连接失败

检查：

```bash
docker compose ps qdrant
docker compose logs --tail=100 qdrant
docker compose exec api python - <<'PY'
import urllib.request
print(urllib.request.urlopen("http://qdrant:6333/collections").read().decode()[:500])
PY
```

如果服务器配置了代理，`.env` 需要：

```env
NO_PROXY=localhost,127.0.0.1,postgres,qdrant
no_proxy=localhost,127.0.0.1,postgres,qdrant
```

---

## 13. 本次更新后的建议观察期

上线后至少观察 30 到 60 分钟：

```bash
docker compose logs -f api
```

重点观察：

- 是否有数据库 schema 错误。
- 是否有验证卡创建异常。
- 是否有 BACH 评审异常。
- 是否有文件上传异常。
- 是否有 Qdrant 连接异常。
- 是否有 DeepSeek 超时或鉴权异常。

建议第二天再检查：

- 用户是否能进入经营工作台。
- 验证卡是否正常生成。
- 证据是否正常入账。
- 完整验证卡是否正常打开。
- BACH 详情是否正常打开。
- 上传资料是否仍然存在。
- 原有报告、会话、资料是否都还在。

---

## 14. 后续单独迁移建议

本次不要同时做数据库迁移。后续可以安排一次单独窗口，把当前 SQLite 迁移到 PostgreSQL。

建议迁移步骤另写专门文档，原则是：

1. 先停写入。
2. 备份 SQLite。
3. 使用 `scripts/migrate_sqlite_to_postgres.py` dry-run。
4. 导入 PostgreSQL。
5. 修改 `DATABASE_URL`。
6. 重启 API。
7. 对比表计数。
8. 重建或校验 Qdrant。
9. 保留 SQLite 原文件至少 30 天。

---

## 15. 最终上线检查表

上线前：

- [ ] 已确认当前服务器目录。
- [ ] 已记录当前 commit。
- [ ] 已确认当前数据库模式。
- [ ] 已备份 `.env`。
- [ ] 已备份 `docker-compose.yml`。
- [ ] 已备份 SQLite 或 PostgreSQL。
- [ ] 已备份上传文件卷。
- [ ] 已备份 Qdrant 卷。
- [ ] 已导出上线前数据计数。
- [ ] 已完成镜像 build。

上线中：

- [ ] 未执行 `down -v`。
- [ ] 未删除 volume。
- [ ] 未删除 `/opt/imc-migration`。
- [ ] API 启动成功。
- [ ] 前端启动成功。
- [ ] 日志无持续错误。

上线后：

- [ ] 登录正常。
- [ ] 经营工作台正常。
- [ ] 可创建验证卡。
- [ ] 可打开完整验证卡。
- [ ] 可添加证据。
- [ ] 可进入 AI 经营访谈。
- [ ] 可进入 BACH 冷酷审判。
- [ ] 可上传文件。
- [ ] 原有资料仍存在。
- [ ] 原有报告仍存在。
- [ ] 原有会话仍存在。
- [ ] 上线后数据计数与上线前一致或只增不减。
- [ ] 已记录新 commit。
- [ ] 已保留备份路径。

---

## 16. 建议的正式执行命令汇总

以下是推荐的最小安全上线命令。执行前请先完成第 5 节备份。

```bash
cd /data/IPM-IMC_Agent

# 1. 记录旧版本
git rev-parse HEAD

# 2. 拉新代码
git fetch origin
git pull origin main

# 3. 先 dry-run 同步到实际部署目录，确认不会误删 .env 和数据
rsync -a --delete --dry-run \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='backend/data/' \
  /data/IPM-IMC_Agent/ \
  /home/opc/imc-agent/

# 4. 正式同步代码到实际部署目录
rsync -a --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='backend/data/' \
  /data/IPM-IMC_Agent/ \
  /home/opc/imc-agent/

# 5. 进入实际部署目录
cd /home/opc/imc-agent

# 6. 构建应用镜像
docker compose build api frontend

# 7. 只替换应用服务，不动数据卷
docker compose up -d --no-deps api
docker compose logs --tail=120 api

docker compose up -d --no-deps frontend
docker compose logs --tail=80 frontend

# 8. 状态检查
docker compose ps
curl -I http://127.0.0.1:18005/docs
curl -I http://127.0.0.1:13005
```

如果使用 Nginx 对外：

```bash
curl -I http://127.0.0.1/
curl -I http://127.0.0.1/docs
```

---

## 17. 结论

本次更新改动大，但只要遵守以下原则，就不会影响线上数据：

1. 更新前完整备份。
2. 不删除数据卷。
3. 不删除 `/opt/imc-migration/imc_ipm.db`。
4. 不同时做 SQLite → PostgreSQL 迁移。
5. 只替换 `api` 和 `frontend` 应用服务。
6. 上线后用表计数和核心流程双重验证。
7. 出问题先回滚代码，必要时再恢复数据。

当前最推荐的上线策略是：

> **保持线上数据模式不变，先部署本次产品代码，确保 7 天验证闭环可用；数据库迁移另择窗口单独处理。**
