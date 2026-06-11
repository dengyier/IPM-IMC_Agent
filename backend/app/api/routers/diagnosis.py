"""Phase 3 商业画布诊断 API 路由。

核心约束：诊断优先级 核心节点>核心切块>已审核扩展>已审核案例；未审核资料不参与；
报告不暴露核心方法论原始资料内容。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    get_core_store,
    get_current_user,
    get_embeddings,
    get_expansion_store,
    get_llm,
    tenant_scope,
)
from app.core.config import get_settings
from app.db.models import (
    DiagnosisReport,
    ExpansionItem,
    ExpansionSource,
    ReportQualityCheck,
    ReviewTask,
)
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.graphs.business_canvas_diagnosis_graph import BusinessCanvasDiagnosisGraph
from app.schemas.diagnosis import (
    DiagnoseRequest,
    DiagnosisReportOut,
    QualityCheckOut,
    ReportDepositSimulationResponse,
)
from app.schemas.task import TaskCreated
from app.services import project_service, task_service
from app.services.deposit_service import deposit_text_source
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/diagnosis", tags=["diagnosis"])


def _owned_report_or_404(db: Session, report_id: str, tid: str | None) -> DiagnosisReport:
    report = db.get(DiagnosisReport, report_id)
    if not report or (tid is not None and report.tenant_id != tid):
        raise HTTPException(status_code=404, detail="报告不存在")
    return report


@router.post("/diagnose", response_model=TaskCreated)
def diagnose(
    request: DiagnoseRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> TaskCreated:
    """生成诊断报告为长任务（数十秒~分钟级）：返回 task_id，前端轮询取 result。"""
    tid = user.tenant_id

    # 解析/自动建项目兜底，并把 project_id 透传给图（报告将挂到该项目下）
    project = project_service.resolve_or_create_for_diagnose(
        db,
        user,
        project_id=request.project_id,
        title=request.title,
        task_pack=request.task_pack,
    )
    request.project_id = project.id

    def work(bg: Session, progress):
        graph = BusinessCanvasDiagnosisGraph(
            db=bg,
            settings=get_settings(),
            embeddings=get_embeddings(),
            core_store=get_core_store(),
            llm=get_llm(),
            tenant_id=tid,
        )
        return graph.run(request, progress_callback=progress)

    task = task_service.create_task(
        db, "diagnosis.diagnose", input=request.model_dump(mode="json"), tenant_id=tid
    )
    task_service.dispatch(task.id, work)
    return TaskCreated(task_id=task.id)


@router.get("/reports", response_model=list[DiagnosisReportOut])
def list_reports(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[DiagnosisReport]:
    tid = tenant_scope(user)
    query = db.query(DiagnosisReport)
    if tid is not None:
        query = query.filter(DiagnosisReport.tenant_id == tid)
    return query.order_by(DiagnosisReport.created_at.desc()).all()


@router.get("/reports/{report_id}", response_model=DiagnosisReportOut)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> DiagnosisReport:
    return _owned_report_or_404(db, report_id, tenant_scope(user))


@router.post("/reports/{report_id}/regenerate", response_model=TaskCreated)
def regenerate_report(
    report_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> TaskCreated:
    """以原报告的输入（标题/问题/公司/画布）重跑诊断，生成一份新报告（异步）。

    诊断图每次 run 都会落一份新报告，故重新生成不覆盖原报告，结果含新 report_id。
    """
    tid = user.tenant_id
    report = _owned_report_or_404(db, report_id, tenant_scope(user))

    request = DiagnoseRequest(
        title=report.title,
        question=report.question or "",
        company_name=report.company_name,
        report_depth=getattr(report, "report_depth", "consulting") or "consulting",
        canvas=dict(report.canvas_input or {}),
    )

    def work(bg: Session, progress):
        graph = BusinessCanvasDiagnosisGraph(
            db=bg,
            settings=get_settings(),
            embeddings=get_embeddings(),
            core_store=get_core_store(),
            llm=get_llm(),
            tenant_id=tid,
        )
        return graph.run(request, progress_callback=progress)

    task = task_service.create_task(
        db,
        "diagnosis.regenerate",
        input=request.model_dump(mode="json"),
        resource_id=report_id,
        tenant_id=tid,
    )
    task_service.dispatch(task.id, work)
    return TaskCreated(task_id=task.id)


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(
    report_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> Response:
    """删除报告及其关联质检结果（质检对报告有外键，需先删）。"""
    report = _owned_report_or_404(db, report_id, tenant_scope(user))
    db.query(ReportQualityCheck).filter(
        ReportQualityCheck.report_id == report.id
    ).delete(synchronize_session=False)
    db.delete(report)
    db.commit()
    return Response(status_code=204)


@router.get("/reports/{report_id}/quality", response_model=QualityCheckOut)
def get_report_quality(
    report_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ReportQualityCheck:
    _owned_report_or_404(db, report_id, tenant_scope(user))
    qc = (
        db.query(ReportQualityCheck)
        .filter(ReportQualityCheck.report_id == report_id)
        .order_by(ReportQualityCheck.created_at.desc())
        .first()
    )
    if not qc:
        raise HTTPException(status_code=404, detail="质检结果不存在")
    return qc


def _report_simulation_deposit_text(report: DiagnosisReport, candidates: list[str]) -> str:
    """报告天机推演资产的沉淀文本（候选资料正文，不含核心课件原文）。"""
    lines = [
        f"# 天机推演沉淀：{report.title}",
        "",
        "- 来源：项目验证诊断报告 · 天机推演",
        f"- 报告 ID：{report.id}",
        f"- 算法版本：{report.algorithm_version or 'tianji-mps.v1'}",
        "",
    ]
    if (report.question or "").strip():
        lines.extend(["## 用户原始问题", "", report.question.strip(), ""])
    if candidates:
        lines.extend(["## 可沉淀资产", "", *[f"- {c}" for c in candidates], ""])

    path_lines = []
    for path in report.scenario_paths or []:
        if isinstance(path, dict) and str(path.get("name") or "").strip():
            conclusion = str(
                path.get("decision_implication") or path.get("description") or ""
            ).strip()
            path_lines.append(f"- {path['name']}：{conclusion}")
    if path_lines:
        lines.extend(["## 路径结论", "", *path_lines, ""])

    risk_lines = []
    for risk in report.tianji_risk_audit or []:
        if isinstance(risk, dict) and str(risk.get("risk") or "").strip():
            mitigation = str(risk.get("mitigation") or "").strip()
            risk_lines.append(f"- {risk['risk']}：{mitigation}")
    if risk_lines:
        lines.extend(["## 风险与缓释", "", *risk_lines, ""])

    step_lines = []
    for step in report.validation_plan or []:
        if isinstance(step, dict) and str(step.get("step") or "").strip():
            criteria = str(step.get("success_criteria") or "").strip()
            step_lines.append(f"- {step['step']}：{criteria}")
    if step_lines:
        lines.extend(["## 验证计划", "", *step_lines, ""])

    assumptions = [str(a).strip() for a in (report.key_assumptions or []) if str(a).strip()]
    if assumptions:
        lines.extend(["## 关键假设", "", *[f"- {a}" for a in assumptions], ""])

    return "\n".join(lines).strip() + "\n"


@router.post(
    "/reports/{report_id}/deposit-simulation",
    response_model=ReportDepositSimulationResponse,
)
def deposit_report_simulation(
    report_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> ReportDepositSimulationResponse:
    """把报告的天机推演资产沉淀为候选资料，进入扩展审核链路。

    仅落扩展层候选池，必须经人工审核才能成为正式知识；不直接写核心库。
    """
    tid = tenant_scope(user)
    report = _owned_report_or_404(db, report_id, tid)

    candidates = [
        str(c).strip() for c in (report.archive_candidates or []) if str(c).strip()
    ]
    if not candidates and not (report.scenario_paths or []):
        raise HTTPException(status_code=400, detail="该报告没有可沉淀的天机推演资产")

    # 幂等：已沉淀且未被驳回 → 返回既有来源；被驳回允许重新提交
    if report.tianji_deposited_source_id:
        source = db.get(ExpansionSource, report.tianji_deposited_source_id)
        if (
            source
            and (tid is None or source.tenant_id == tid)
            and source.status != "rejected"
        ):
            item_count = (
                db.query(ExpansionItem)
                .filter(ExpansionItem.source_id == source.id)
                .count()
            )
            review_task_count = (
                db.query(ReviewTask)
                .join(ExpansionItem, ReviewTask.item_id == ExpansionItem.id)
                .filter(
                    ExpansionItem.source_id == source.id,
                    ReviewTask.status == "pending",
                )
                .count()
            )
            return ReportDepositSimulationResponse(
                report_id=report.id,
                source_id=source.id,
                title=source.title,
                status=source.status,
                item_count=item_count,
                review_task_count=review_task_count,
                message="该报告的推演资产已沉淀为候选资料，可前往人工审核台处理。",
            )

    title = f"天机推演沉淀：{report.title}"[:255]
    try:
        deposit = deposit_text_source(
            db,
            get_settings(),
            embeddings,
            expansion_store,
            llm,
            title=title,
            text=_report_simulation_deposit_text(report, candidates),
            source_type="tianji_simulation",
            submitted_by=user.phone,
            tenant_id=report.tenant_id,
            file_stub=report.id,
            subdir="tianji-simulation-deposits",
            meta={
                "deposited_from": "diagnosis_report",
                "report_id": report.id,
                "project_id": report.project_id,
                "algorithm_version": report.algorithm_version,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    report.tianji_deposited_source_id = deposit.source.id
    db.add(report)
    db.commit()

    return ReportDepositSimulationResponse(
        report_id=report.id,
        source_id=deposit.source.id,
        title=deposit.source.title,
        status=deposit.status,
        item_count=deposit.item_count,
        review_task_count=deposit.review_task_count,
        message="已将天机推演资产沉淀为候选资料，并进入人工审核流程。",
    )
