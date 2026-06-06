"""ExternalInfoEvolutionGraph —— Phase 2 外部信息进化编排。

两条流程：
- absorb：解析 → 切块 → 向量化(expansion) → 抽取扩展单元 → 对齐核心节点 → 生成审核任务。
- evolve：把【已审核通过】的扩展吸收为节点新版本（不覆盖核心字段）。

设计与 Phase 1 一致：顺序执行 + AgentRun 审计；离线可跑通。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import (
    AgentRun,
    ExpansionChunk,
    ExpansionItem,
    ExpansionSource,
    ReviewTask,
)
from app.schemas.expansion import AbsorbExpansionResult, EvolveNodeResult
from app.services.embeddings import EmbeddingProvider
from app.services.expansion_absorption_service import ExpansionAbsorptionService
from app.services.knowledge_version_service import KnowledgeVersionService
from app.services.llm import LLMService
from app.services.vector_store import VectorStore


class ExternalInfoEvolutionGraph:
    def __init__(
        self,
        db: Session,
        settings: Settings,
        embeddings: EmbeddingProvider,
        expansion_store: VectorStore,
        llm: LLMService | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.embeddings = embeddings
        self.expansion_store = expansion_store
        self.llm = llm
        self.absorb_svc = ExpansionAbsorptionService(
            db, embeddings, expansion_store, llm
        )
        self.version_svc = KnowledgeVersionService(db)

    # ------------------------------------------------------------------ #
    # absorb flow
    # ------------------------------------------------------------------ #

    def _purge_prior_absorption(self, source_id: str) -> dict[str, int]:
        """清除某来源上一轮吸收产物（审核任务→条目→切块），保证重复吸收是替换语义。

        注意：只清理「未进入正式版本」的产物。已审核通过并演进的扩展条目通过
        knowledge_node_versions.incorporated_item_ids 留痕，删除条目不影响已生成的版本。
        """
        item_ids = [
            row[0]
            for row in self.db.query(ExpansionItem.id)
            .filter(ExpansionItem.source_id == source_id)
            .all()
        ]
        review_deleted = 0
        if item_ids:
            review_deleted = (
                self.db.query(ReviewTask)
                .filter(ReviewTask.item_id.in_(item_ids))
                .delete(synchronize_session=False)
            )
        items_deleted = (
            self.db.query(ExpansionItem)
            .filter(ExpansionItem.source_id == source_id)
            .delete(synchronize_session=False)
        )
        chunks_deleted = (
            self.db.query(ExpansionChunk)
            .filter(ExpansionChunk.source_id == source_id)
            .delete(synchronize_session=False)
        )
        if review_deleted or items_deleted or chunks_deleted:
            self.db.flush()
        return {
            "review_tasks": review_deleted,
            "items": items_deleted,
            "chunks": chunks_deleted,
        }

    def run_absorb(self, source: ExpansionSource) -> AbsorbExpansionResult:
        trace: list[str] = []
        run = self._start_run("expansion_absorb", {"source_id": source.id})
        try:
            # 幂等：重复吸收同一来源应「替换」而非「追加」，先清除上一轮产物
            purged = self._purge_prior_absorption(source.id)
            if purged:
                trace.append(
                    f"检测到既有吸收产物，已清除以重新吸收："
                    f"{purged['review_tasks']} 审核任务 / {purged['items']} 条目 / {purged['chunks']} 切块"
                )

            records = self.absorb_svc.parse_and_chunk(source)
            trace.append(f"解析并切块：{len(records)} 块")

            embedded = self.absorb_svc.embed_chunks(source, records)
            trace.append(
                f"写入扩展向量库 {self.expansion_store.collection}"
                f"（{self.expansion_store.backend}）：{embedded} 点"
            )

            items, tasks = self.absorb_svc.absorb_items(source, records)
            trace.append(f"抽取扩展单元：{len(items)} 个，对齐核心节点并生成审核任务")
            trace.append(f"生成待审核任务：{len(tasks)} 个（review_status=pending）")

            source.status = "pending_review" if tasks else "extraction_empty"
            self.db.add(source)
            self.db.flush()
            trace.append(f"来源状态更新为 {source.status}")

            result = AbsorbExpansionResult(
                source_id=source.id,
                status=source.status,
                chunk_count=len(records),
                embedded_count=embedded,
                item_count=len(items),
                review_task_count=len(tasks),
                vector_backend=self.expansion_store.backend,
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
    # evolve flow
    # ------------------------------------------------------------------ #

    def run_evolve(self, node_id: str, created_by: str | None = None) -> EvolveNodeResult:
        trace: list[str] = []
        run = self._start_run(
            "node_version_evolve", {"node_id": node_id, "created_by": created_by}
        )
        try:
            version, vtrace = self.version_svc.evolve_node(node_id, created_by)
            trace.extend(vtrace)
            if version is None:
                raise ValueError("没有可吸收的已审核扩展，无法演进版本。")

            result = EvolveNodeResult(
                node_id=node_id,
                version=version.version,
                incorporated_item_count=len(version.incorporated_item_ids or []),
                node_version_id=version.id,
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
            prompt_version="phase2.v1",
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
