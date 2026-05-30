"""MethodologyKernelBuildGraph —— Phase 1 方法论底座构建编排。

两条流程：
- process：解析 → 切块 → 向量化(core)。落库 methodology_chunks + methodology_core_chunks。
- build：加载切块 → 抽取节点 → 落库节点 → 构建关系边 → 生成路由规则。

设计：优先使用 LangGraph StateGraph 编排；若运行环境未安装 langgraph，则顺序回退执行，
保证 Phase 1 闭环在离线环境也能跑通。每次运行写入 AgentRun 审计。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import AgentRun, MethodologyChunk, MethodologySource
from app.schemas.methodology import (
    BuildKernelResult,
    ProcessSourceResult,
)
from app.services.embeddings import EmbeddingProvider
from app.services.knowledge_graph_service import KnowledgeGraphService
from app.services.llm import LLMService
from app.services.methodology_kernel_service import MethodologyKernelService
from app.services.problem_routing_service import ProblemRoutingService
from app.services.vector_store import VectorStore


class MethodologyKernelBuildGraph:
    """方法论底座构建编排器。"""

    def __init__(
        self,
        db: Session,
        settings: Settings,
        embeddings: EmbeddingProvider,
        core_store: VectorStore,
        llm: LLMService | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.embeddings = embeddings
        self.core_store = core_store
        self.llm = llm
        self.kernel = MethodologyKernelService(db, embeddings, core_store, llm)
        self.graph_svc = KnowledgeGraphService(db, embeddings)
        self.routing_svc = ProblemRoutingService(db)

    # ------------------------------------------------------------------ #
    # process flow
    # ------------------------------------------------------------------ #

    def run_process(self, source: MethodologySource) -> ProcessSourceResult:
        trace: list[str] = []
        run = self._start_run("methodology_process", {"source_id": source.id})
        try:
            records = self.kernel.parse_and_chunk(source)
            trace.append(f"解析并切块：{len(records)} 块")

            embedded = self.kernel.embed_core_chunks(source, records)
            trace.append(
                f"写入核心向量库 {self.core_store.collection}（{self.core_store.backend}）：{embedded} 点"
            )

            source.status = "processed"
            self.db.add(source)
            self.db.flush()
            trace.append("来源状态更新为 processed")

            result = ProcessSourceResult(
                source_id=source.id,
                status="processed",
                chunk_count=len(records),
                embedded_count=embedded,
                vector_backend=self.core_store.backend,
                trace=trace,
            )
            self._finish_run(run, result.model_dump(), trace)
            self.db.commit()
            return result
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            self._fail_run(run, str(exc))
            self.db.commit()
            raise

    # ------------------------------------------------------------------ #
    # build flow
    # ------------------------------------------------------------------ #

    def run_build(self, source: MethodologySource) -> BuildKernelResult:
        trace: list[str] = []
        run = self._start_run("methodology_build_kernel", {"source_id": source.id})
        try:
            chunks = (
                self.db.query(MethodologyChunk)
                .filter(MethodologyChunk.source_id == source.id)
                .order_by(MethodologyChunk.chunk_index)
                .all()
            )
            if not chunks:
                raise ValueError("该来源尚无切块，请先调用 /process。")
            trace.append(f"加载切块：{len(chunks)} 块")

            candidates, used_llm = self.kernel.extract_nodes(chunks)
            trace.append(
                f"抽取方法论节点：{len(candidates)} 个（{'LLM' if used_llm else '本地回退'}）"
            )

            name_to_id = self.kernel.persist_nodes(candidates)
            trace.append(f"落库节点：{len(name_to_id)} 个")

            edges = self.graph_svc.build_edges(candidates, name_to_id)
            trace.append(f"构建关系边：{len(edges)} 条")

            rules = self.routing_svc.generate_rules(replace_existing=True)
            trace.append(f"生成路由规则：{len(rules)} 条")

            source.status = "kernel_built"
            self.db.add(source)
            self.db.flush()
            trace.append("来源状态更新为 kernel_built")

            result = BuildKernelResult(
                source_id=source.id,
                status="kernel_built",
                node_count=len(name_to_id),
                edge_count=len(edges),
                used_llm=used_llm,
                trace=trace,
            )
            self._finish_run(run, result.model_dump(), trace)
            self.db.commit()
            return result
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            self._fail_run(run, str(exc))
            self.db.commit()
            raise

    # ------------------------------------------------------------------ #
    # AgentRun audit
    # ------------------------------------------------------------------ #

    def _start_run(self, graph_name: str, input_payload: dict[str, Any]) -> AgentRun:
        run = AgentRun(
            graph_name=graph_name,
            input=input_payload,
            status="running",
            model_name=self.llm.model if (self.llm and self.llm.available) else "local",
            prompt_version="phase1.v1",
        )
        self.db.add(run)
        self.db.flush()
        return run

    def _finish_run(self, run: AgentRun, output: dict[str, Any], trace: list[str]) -> None:
        run.status = "succeeded"
        run.output = output
        run.intermediate_steps = trace
        run.completed_at = datetime.utcnow()
        self.db.add(run)
        self.db.flush()

    def _fail_run(self, run: AgentRun, error: str) -> None:
        run.status = "failed"
        run.error_message = error
        run.completed_at = datetime.utcnow()
        self.db.add(run)
        self.db.flush()
