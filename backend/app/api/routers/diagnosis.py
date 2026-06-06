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
    get_llm,
    tenant_scope,
)
from app.core.config import get_settings
from app.db.models import DiagnosisReport, ReportQualityCheck
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.graphs.business_canvas_diagnosis_graph import BusinessCanvasDiagnosisGraph
from app.schemas.diagnosis import (
    DiagnoseRequest,
    DiagnosisReportOut,
    QualityCheckOut,
)
from app.schemas.task import TaskCreated
from app.services import task_service

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

    def work(bg: Session):
        graph = BusinessCanvasDiagnosisGraph(
            db=bg,
            settings=get_settings(),
            embeddings=get_embeddings(),
            core_store=get_core_store(),
            llm=get_llm(),
            tenant_id=tid,
        )
        return graph.run(request)

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

    def work(bg: Session):
        graph = BusinessCanvasDiagnosisGraph(
            db=bg,
            settings=get_settings(),
            embeddings=get_embeddings(),
            core_store=get_core_store(),
            llm=get_llm(),
            tenant_id=tid,
        )
        return graph.run(request)

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
