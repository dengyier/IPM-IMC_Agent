"""BusinessCanvasDiagnosisGraph —— Phase 3 商业画布诊断编排。

流程：route（问题→意图→节点）→ fuse（分层上下文融合）→ diagnose（生成报告）
→ quality_check（质量自检）→ 落库。

设计与前两期一致：顺序执行 + AgentRun 审计；离线可跑通。
诊断报告不暴露核心方法论原始资料；未审核扩展不参与正式诊断。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import AgentRun, DiagnosisReport, ReportQualityCheck
from app.schemas.diagnosis import (
    DiagnoseRequest,
    DiagnoseResult,
    DiagnosisReportOut,
    QualityCheckOut,
)
from app.services.context_fusion_service import ContextFusionService
from app.services.diagnosis_service import DiagnosisService
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.problem_routing_service import ProblemRoutingService
from app.services.report_quality_service import ReportQualityService
from app.services.vector_store import VectorStore


class BusinessCanvasDiagnosisGraph:
    def __init__(
        self,
        db: Session,
        settings: Settings,
        embeddings: EmbeddingProvider,
        core_store: VectorStore,
        llm: LLMService | None = None,
        tenant_id: str | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.embeddings = embeddings
        self.core_store = core_store
        self.llm = llm
        self.tenant_id = tenant_id
        self.routing_svc = ProblemRoutingService(db)
        self.fusion_svc = ContextFusionService(db, embeddings, core_store)
        self.diagnosis_svc = DiagnosisService(llm)
        self.quality_svc = ReportQualityService()

    def run(self, request: DiagnoseRequest) -> DiagnoseResult:
        trace: list[str] = []
        run = self._start_run(
            "business_canvas_diagnosis",
            {"title": request.title, "question": request.question, "report_depth": request.report_depth},
        )
        try:
            # 1. route
            routing = self.routing_svc.route(request.question, request.canvas)
            trace.append(
                f"路由到意图「{routing.intent}」(匹配度 {routing.matched_score})，"
                f"required={len(routing.required_node_ids)} optional={len(routing.optional_node_ids)}"
            )

            # 2. fuse
            context = self.fusion_svc.fuse(
                request.question, routing, request.canvas, tenant_id=self.tenant_id
            )
            trace.append(
                f"上下文融合：节点 {len(context.nodes)}、核心切块 {len(context.core_chunks)}(内部)、"
                f"已审核扩展 {len(context.approved_expansions)}、案例 {len(context.cases)}，"
                f"综合分 {context.composite_score}"
            )

            # 3. diagnose
            payload, used_llm = self.diagnosis_svc.diagnose(request, routing, context)
            trace.append(f"生成诊断报告（{'LLM' if used_llm else '本地回退'}）")

            report = DiagnosisReport(
                tenant_id=self.tenant_id,
                title=request.title,
                company_name=request.company_name,
                question=request.question,
                intent=payload.get("intent") or routing.intent,
                report_depth=payload.get("report_depth") or request.report_depth,
                canvas_input=request.canvas,
                module_findings=payload["module_findings"],
                executive_summary=payload.get("executive_summary", {}),
                core_tensions=payload.get("core_tensions", []),
                cross_canvas_logic=payload.get("cross_canvas_logic", []),
                unit_economics=payload.get("unit_economics", {}),
                risk_matrix=payload.get("risk_matrix", []),
                mvp_validation_path=payload.get("mvp_validation_path", []),
                ninety_day_plan=payload.get("ninety_day_plan", {}),
                final_recommendation=payload.get("final_recommendation", {}),
                key_assumptions=payload["key_assumptions"],
                risks=payload["risks"],
                recommended_actions=payload["recommended_actions"],
                evidence_refs=payload["evidence_refs"],
                methodology_node_ids=payload["methodology_node_ids"],
                overall_summary=payload["overall_summary"],
                used_llm=used_llm,
                status="draft",
            )
            self.db.add(report)
            self.db.flush()

            # 4. quality check
            qc = self.quality_svc.check(payload, context, request.canvas)
            quality = ReportQualityCheck(
                tenant_id=self.tenant_id,
                report_id=report.id,
                overall_score=qc["overall_score"],
                dimension_scores=qc["dimension_scores"],
                passed=qc["passed"],
                issues=qc["issues"],
                suggestions=qc["suggestions"],
            )
            self.db.add(quality)
            report.quality_score = qc["overall_score"]
            report.status = "checked" if qc["passed"] else "draft"
            self.db.add(report)
            self.db.flush()
            trace.append(
                f"质量自检：{qc['overall_score']}（{'通过' if qc['passed'] else '未通过'}）"
            )

            result = DiagnoseResult(
                report=DiagnosisReportOut.model_validate(report),
                routing=routing,
                quality=QualityCheckOut.model_validate(quality),
                used_llm=used_llm,
                trace=trace,
            )
            self._finish_run(run, {"report_id": report.id, "quality": qc["overall_score"]}, trace)
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
            tenant_id=self.tenant_id,
            graph_name=graph_name,
            input=input_payload,
            status="running",
            model_name=self.llm.model if (self.llm and self.llm.available) else "local",
            prompt_version="phase3.v2-consulting",
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
