# 天机AI 商业决策智能体

面向 IMC&IPM 课程知识资产的商业决策智能体 MVP。系统把课程资料、课堂笔记、商业画布和案例沉淀为可审核的知识节点，并支持商业画布诊断、同学笔记进化和结构化报告生成。

## 功能范围

- 文件上传与解析：支持 `PDF`、`DOCX`、`TXT`、`MD`、`PPTX`、`XLSX`
- 文档清洗、分块、Embedding 与向量入库
- 知识节点候选抽取与人工审核
- 商业画布九宫格深度诊断与结构化报告生成
- 同学笔记匹配、增量观点提取与审核任务生成

## 项目结构

```text
backend/     FastAPI API、数据模型、Agent 工作流、解析与检索服务、运维脚本
frontend/    Next.js 14 前端工作台
deploy/      Nginx 反向代理配置
docs/        部署文档
docker-compose.yml   全栈一键部署编排（postgres + qdrant + 后端 + 前端 + nginx）
.env.example
```

## 快速启动（Docker 一键部署）

```bash
cp .env.example .env          # 改 POSTGRES_PASSWORD、PUBLIC_BASE_URL，按需填 DEEPSEEK / 腾讯云短信
docker compose up -d --build
docker compose ps
```

启动后访问 `http://localhost/`（Nginx 默认 80 端口；后端经 `/api`、`/docs` 代理）。
数据持久化在 `postgres_data` / `qdrant_data` / `upload_data` 三个命名卷，更新代码不丢数据。

完整部署、数据迁移、HTTPS、备份恢复见 **[docs/香港服务器部署文档.md](docs/香港服务器部署文档.md)**。

没有配置 DeepSeek Key 时，后端会使用本地确定性生成逻辑，便于先跑通 Demo 流程。

## 本地开发

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 18005
```

前端：

```bash
cd frontend
npm install
npm run dev
```

## 核心原则

- Agent 输出统一为 JSON schema
- 同学笔记只生成审核任务，不直接覆盖老师方法论
- 知识节点按老师观点、同学补充、案例扩展、差异观点分层
- 报告保存用户输入、调用节点、检索片段与模型输出，保证可追溯
