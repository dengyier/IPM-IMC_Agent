# IMC&IPM 商业决策智能体

面向 IMC&IPM 课程知识资产的商业决策智能体 MVP。系统把课程资料、课堂笔记、商业画布和案例沉淀为可审核的知识节点，并支持商业画布诊断、同学笔记进化和结构化报告生成。

## 功能范围

- 文件上传与解析：支持 `PDF`、`DOCX`、`TXT`、`MD`、`PPTX`
- 文档清洗、分块、Embedding 与向量入库
- 知识节点候选抽取与人工审核
- 商业画布九宫格诊断与 Markdown 报告生成
- 同学笔记匹配、增量观点提取与审核任务生成

## 项目结构

```text
backend/     FastAPI API、数据模型、Agent 工作流、解析与检索服务
docker-compose.yml
.env.example
```

## 快速启动

1. 复制配置：

```bash
cp .env.example .env
```

2. 启动基础服务和应用：

```bash
docker compose up --build
```

3. 打开：

- 后端 API：http://localhost:8000/docs
- Qdrant：http://localhost:6333/dashboard
- MinIO Console：http://localhost:9001

没有配置 DeepSeek Key 时，后端会使用本地确定性生成逻辑，便于先跑通 Demo 流程。

## 本地开发

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## 核心原则

- Agent 输出统一为 JSON schema
- 同学笔记只生成审核任务，不直接覆盖老师方法论
- 知识节点按老师观点、同学补充、案例扩展、差异观点分层
- 报告保存用户输入、调用节点、检索片段与模型输出，保证可追溯
