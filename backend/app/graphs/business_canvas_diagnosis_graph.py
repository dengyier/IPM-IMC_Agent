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
from app.services import project_service
from app.services.report_quality_service import ReportQualityService
from app.services.tianji_simulation_service import TianjiSimulationService
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

    def run(self, request: DiagnoseRequest, progress_callback=None) -> DiagnoseResult:
        trace: list[str] = []
        run = self._start_run(
            "business_canvas_diagnosis",
            {"title": request.title, "question": request.question, "report_depth": request.report_depth},
        )
        try:
            # 1. route
            if progress_callback:
                progress_callback.update(20, "正在分析问题并路由到相关知识节点...")
            routing = self.routing_svc.route(request.question, request.canvas)
            trace.append(
                f"路由到意图「{routing.intent}」(匹配度 {routing.matched_score})，"
                f"required={len(routing.required_node_ids)} optional={len(routing.optional_node_ids)}"
            )

            # 2. fuse
            if progress_callback:
                progress_callback.update(40, "正在融合上下文和知识库...")
            context = self.fusion_svc.fuse(
                request.question, routing, request.canvas, tenant_id=self.tenant_id
            )
            trace.append(
                f"上下文融合：节点 {len(context.nodes)}、核心切块 {len(context.core_chunks)}(内部)、"
                f"已审核扩展 {len(context.approved_expansions)}、案例 {len(context.cases)}，"
                f"图谱扩展 {context.graph_expanded_count} 个节点，综合分 {context.composite_score}"
            )

            # 3. simulate
            if progress_callback:
                progress_callback.update(55, "正在进行天机多路径推演...")
            project_context = self._project_context(request)
            project_history = (
                project_service.history_context(self.db, request.project_id)
                if request.project_id
                else ""
            )
            tianji_simulation = TianjiSimulationService(
                self.llm, embeddings=self.embeddings
            ).run(
                question=request.question or request.title,
                project_context=project_context,
                project_history=project_history,
                routing=routing,
                context=context,
                mode="diagnosis",
                canvas=request.canvas,
            )
            trace.append(
                f"天机推演：路径 {len(tianji_simulation.scenario_paths)}、"
                f"风险 {len(tianji_simulation.risk_audit)}、"
                f"验证步骤 {len(tianji_simulation.validation_plan)}"
            )

            # 4. diagnose
            if progress_callback:
                progress_callback.update(60, "正在生成诊断报告...")
            payload, used_llm = self.diagnosis_svc.diagnose(
                request, routing, context, tianji_simulation=tianji_simulation
            )
            trace.append(f"生成诊断报告（{'LLM' if used_llm else '本地回退'}）")

            if progress_callback:
                progress_callback.update(80, "正在保存报告...")
            report = DiagnosisReport(
                tenant_id=self.tenant_id,
                project_id=getattr(request, "project_id", None),
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
                decision_frame=payload.get("decision_frame", {}),
                decision_roles=payload.get("decision_roles", []),
                scenario_paths=payload.get("scenario_paths", []),
                causal_chains=payload.get("causal_chains", []),
                unit_economics=payload.get("unit_economics", {}),
                risk_matrix=payload.get("risk_matrix", []),
                tianji_risk_audit=payload.get("tianji_risk_audit", []),
                mvp_validation_path=payload.get("mvp_validation_path", []),
                validation_plan=payload.get("validation_plan", []),
                contradictions=payload.get("contradictions", []),
                assumption_status=payload.get("assumption_status", []),
                roles_degraded=payload.get("roles_degraded", False),
                role_similarity_max=payload.get("role_similarity_max", 0.0),
                debate_rounds=payload.get("debate_rounds", []),
                consensus=payload.get("consensus", []),
                disagreements=payload.get("disagreements", []),
                ninety_day_plan=payload.get("ninety_day_plan", {}),
                final_recommendation=payload.get("final_recommendation", {}),
                archive_candidates=payload.get("archive_candidates", []),
                algorithm_version=payload.get("algorithm_version"),
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
            project_service.update_risk_profile(
                self.db,
                getattr(request, "project_id", None),
                payload.get("tianji_risk_audit", []),
            )

            # 4. quality check
            if progress_callback:
                progress_callback.update(90, "正在进行质量检查...")
            qc = self.quality_svc.check(payload, context, request.canvas)
            if payload.get("roles_degraded"):
                qc["issues"].append("多角色立场相似度过高，推演可能退化为单一视角。")
                qc["suggestions"].append("补充不同角色的证据子集，重新生成深度推演。")
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
            if payload.get("debate_rounds"):
                trace.append(
                    "天机辩论轮次："
                    f"{payload.get('debate_rounds', [])}；"
                    f"共识：{payload.get('consensus', [])}；"
                    f"分歧：{payload.get('disagreements', [])}"
                )

            result = DiagnoseResult(
                report=DiagnosisReportOut.model_validate(report),
                routing=routing,
                quality=QualityCheckOut.model_validate(quality),
                used_llm=used_llm,
                trace=trace,
            )
            self._finish_run(
                run,
                {
                    "report_id": report.id,
                    "quality": qc["overall_score"],
                    "metrics": {
                        "node_refs": len(payload.get("methodology_node_ids", [])),
                        "graph_expanded": context.graph_expanded_count,
                        "paths": len(payload.get("scenario_paths", [])),
                        "roles": len(payload.get("decision_roles", [])),
                        "used_llm": used_llm,
                        "roles_degraded": bool(payload.get("roles_degraded")),
                    },
                },
                trace,
            )
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

    @staticmethod
    def _project_context(request: DiagnoseRequest) -> str:
        canvas_lines = []
        for key, value in (request.canvas or {}).items():
            if value:
                canvas_lines.append(f"{key}：{value}")
        return "\n".join(
            part
            for part in [
                f"项目名称：{request.title}",
                f"公司/主体：{request.company_name or '未填写'}",
                f"当前核心问题：{request.question or '未填写'}",
                f"任务包：{request.task_pack or '未填写'}",
                "画布输入：" + "；".join(canvas_lines[:9]) if canvas_lines else "",
            ]
            if part
        )

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
