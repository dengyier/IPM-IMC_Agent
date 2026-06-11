# 阶段 0 技术方案：项目实体 + 诊断挂项目 + 报告状态机

## 0. 目标与范围
**目标**：建立「项目（Project）」作为核心聚合对象，让诊断报告挂到项目下，并把报告状态升级为可流转的状态机；诊断入口支持「任务包类型」。这是后续所有阶段（任务化、复盘、经营档案）的承重墙。

**本阶段做**：数据模型 + 接口 + 最小前端接线。
**本阶段不做**：`ValidationTask` 物化（阶段2）、访谈追问（阶段3）、复盘回填（阶段4）、首页四入口大改（阶段1，仅预留 `task_pack`）。

**不破坏**：现有桌面/移动诊断流程在不传 `project_id` 时行为不变（自动建项目兜底）。

---

## 1. 数据模型

### 1.1 新增 `Project`（`backend/app/db/models/project.py`）
```
projects
  id            String(36) PK = uid
  tenant_id     String(36) index           # 多租户隔离，与现有一致
  user_id       String(36) index           # 归属用户
  name          String(255)                # 项目名称
  industry      String(120) null           # 所属行业
  stage         String(40)  null           # 目标客户/阶段描述（自由）
  target_customer Text  default ""
  current_problem Text  default ""
  task_pack     String(40) default "new_project"  # new_project|sales_growth|ai_acquisition|review
  status        String(40) default "idea"  # 见 §3.1 项目状态机
  meta          JsonType default dict
  created_at / updated_at  DateTime
```
- 注册到 `app/db/models/__init__.py`（import + `__all__`），保证 `create_all` 建表。
- 计数（诊断次数/任务数/复盘次数）**不落冗余列**，由查询聚合得到，避免维护不一致（参考 review_task_count 的实时统计经验）。

### 1.2 `DiagnosisReport` 增列
- 新增 `project_id: String(36) index null`（外键语义，指向 projects.id；为兼容旧数据可空）。
- `status` 字段已存在（默认 `draft`）——本阶段定义其取值与流转（§3.2），不新增列。

### 1.3 迁移（无 Alembic，沿用自愈机制）
- `projects` 是**新表** → `create_all` 自动建，无需额外处理。
- `diagnosis_reports.project_id` 是**已有表的新列** → 必须加入 `backend/app/db/session.py` 的 `_COLUMN_ADDITIONS`：
  ```python
  "diagnosis_reports": { ..., "project_id": "VARCHAR(36)" }
  ```
  这样 SQLite 与 PostgreSQL 升级老库都会自动补列（`_pg_ddl` 已处理类型翻译）。

---

## 2. 后端接口

### 2.1 项目 CRUD（新 `backend/app/api/routers/project.py`，prefix `/api/projects`）
| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/projects` | `get_current_user` | 建项目（name 必填，task_pack 可选）|
| GET | `/api/projects` | `get_current_user` | 列当前用户/租户项目（`tenant_scope` 隔离），带聚合计数（report_count/last_diagnosed_at）|
| GET | `/api/projects/{id}` | owner | 项目详情 + 其报告列表摘要 |
| PATCH | `/api/projects/{id}` | owner | 改 name/industry/status 等（status 经 §3.1 校验）|
| DELETE | `/api/projects/{id}` | owner | 删除（级联：其报告 `project_id` 置空或一并删，**默认置空**保留报告）|

- Schema：`backend/app/schemas/project.py`（`ProjectCreate / ProjectUpdate / ProjectOut`，`ProjectOut` 含聚合计数字段）。
- 注册路由到 `app/main.py`（仿 `feedback.router`）。

### 2.2 诊断接口扩展（`/api/diagnosis/diagnose`）
- `DiagnoseRequest` 增可选字段：`project_id: str | None`、`task_pack: str | None`。
- 处理逻辑（在 `diagnose` 端点 / `DiagnosisService`）：
  1. 若传 `project_id` → 校验 owner；否则**自动新建 Project**（name 取诊断 title、task_pack 取请求值或默认 new_project、status=`validating`）。
  2. 报告落库时写入 `project_id`，`status` 由 `draft` → 生成成功置 `generated`（见 §3.2）。
  3. `report_depth` 维持现状（已支持）。
- `regenerate` 端点：沿用原报告的 `project_id`。
- `DiagnosisReportOut` 增 `project_id` 字段返回。

---

## 3. 状态机（提前定死，阶段2/4 依赖）

### 3.1 项目状态 `Project.status`
`idea`(想法期) → `validating`(验证期) → `trial`(试运营) → `growth`(增长期)；任意态可 → `paused`(暂停)。
- 仅允许相邻推进 + 任意→paused + paused→原态恢复；非法转移 PATCH 返回 400。
- 集中在 `app/services/project_service.py` 的 `transition(project, to)` 校验。

### 3.2 报告状态 `DiagnosisReport.status`
`draft`(草稿) → `generated`(已生成) → `executing`(执行中) → `pending_review`(待复盘) → `reviewed`(已复盘) → `archived`(已归档)。
- 阶段0 只产生 `draft→generated`（诊断完成）；`executing` 起由阶段2/4 驱动。
- 前端 `presentation.ts` 增 `reportStatusTone` 对应 6 态的中文标签+色（现有 `sourceStatusTone`/`reviewStatusTone` 同款写法）。

---

## 4. 前端（阶段0 最小接线，不做大 UI）
- `lib/api.ts`：新增 `projectApi`（create/list/get/update/del）+ 类型 `Project`；`diagnosisApi.diagnose` 入参增 `project_id?` / `task_pack?`；`DiagnosisReport` 类型增 `project_id`。
- 诊断提交（桌面 `ProjectForm` 与移动 `MobileCanvasForm` 的 `handleDiagnose`）：暂不强制选项目，先走「自动建项目」兜底，仅透传 `task_pack`（若入口已知）。
- 报告中心/报告详情：展示报告 `status` 的中文状态徽章（用新 `reportStatusTone`）。
- **不在本阶段做**：项目选择器、我的项目列表页（留给阶段1/4 的「经营档案」）。

---

## 5. 改动文件清单
**后端**：`models/project.py`(新) · `models/__init__.py` · `db/session.py`(_COLUMN_ADDITIONS) · `models/diagnosis.py`(project_id) · `schemas/project.py`(新) · `schemas/diagnosis.py`(DiagnoseRequest/Out 加字段) · `services/project_service.py`(新, transition) · `services/diagnosis_service.py`(写 project_id/status) · `api/routers/project.py`(新) · `api/routers/diagnosis.py`(自动建项目) · `main.py`(注册路由)。
**前端**：`lib/api.ts`(projectApi/类型) · `lib/presentation.ts`(reportStatusTone) · 诊断两处 `handleDiagnose` 透传 · 报告中心状态徽章。

## 6. 复用点（不要新写）
- 多租户：`tenant_scope(user)`、`get_current_user`、owner 校验（仿 `feedback`/`assistant` 路由）。
- 自愈迁移：`_ensure_schema_columns` + `_pg_ddl`（已支持 SQLite+PG）。
- 异步诊断：`task_service.create_task` + `pollTask`（不变）。
- 状态徽章渲染：`presentation.ts` 现有 tone 表写法。

## 7. 验证
- `cd backend && .venv/bin/python -c "import app.main"`（导入即触发模型注册，确认无误）；后端 `--reload` 起来 `init_db` 自动建表/补列。
- `npx tsc --noEmit` 前端类型通过；`curl /` `/canvas-diagnosis` `/reports` 200。
- TestClient（依赖覆盖 `get_current_user`）端到端：① POST /api/projects 建项目；② POST /api/diagnosis/diagnose 不传 project_id → 轮询完成 → 报告自动挂到新项目、status=generated；③ 传 project_id → 报告挂到指定项目；④ GET /api/projects 计数正确；⑤ PATCH 非法状态转移返回 400。
- 回归：不传 project_id 的旧诊断流程行为不变。

## 8. 风险与注意
- **autoflush=False**：项目计数若在同会话内"改完即查"，先 `db.flush()`（项目记忆已记录此坑）。
- **存量报告** `project_id` 为空：列表/详情需容空；可做一次性脚本把历史报告按 title 归并到项目（可选，非阻塞）。
- 自动建项目可能造成"项目泛滥"：同一用户重复诊断同名项目时，可选「按 title 复用最近项目」策略——本阶段先简单每次新建，阶段1 入口再优化。
