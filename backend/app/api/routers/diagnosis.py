"""Phase 3 商业画布诊断 API 路由。

核心约束：诊断优先级 核心节点>核心切块>已审核扩展>已审核案例；未审核资料不参与；
报告不暴露核心方法论原始资料内容。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_core_store, get_embeddings, get_llm
from app.core.config import get_settings
from app.db.models import DiagnosisReport, ReportQualityCheck
from app.db.session import get_db
from app.graphs.business_canvas_diagnosis_graph import BusinessCanvasDiagnosisGraph
from app.schemas.diagnosis import (
    DiagnoseRequest,
    DiagnoseResult,
    DiagnosisReportOut,
    QualityCheckOut,
)
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/diagnosis", tags=["diagnosis"])


@router.post("/diagnose", response_model=DiagnoseResult)
def diagnose(
    request: DiagnoseRequest,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> DiagnoseResult:
    graph = BusinessCanvasDiagnosisGraph(
        db=db,
        settings=get_settings(),
        embeddings=embeddings,
        core_store=core_store,
        llm=llm,
    )
    try:
        return graph.run(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/reports", response_model=list[DiagnosisReportOut])
def list_reports(db: Session = Depends(get_db)) -> list[DiagnosisReport]:
    return db.query(DiagnosisReport).order_by(DiagnosisReport.created_at.desc()).all()


@router.get("/reports/{report_id}", response_model=DiagnosisReportOut)
def get_report(report_id: str, db: Session = Depends(get_db)) -> DiagnosisReport:
    report = db.get(DiagnosisReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")
    return report


@router.get("/reports/{report_id}/quality", response_model=QualityCheckOut)
def get_report_quality(report_id: str, db: Session = Depends(get_db)) -> ReportQualityCheck:
    qc = (
        db.query(ReportQualityCheck)
        .filter(ReportQualityCheck.report_id == report_id)
        .order_by(ReportQualityCheck.created_at.desc())
        .first()
    )
    if not qc:
        raise HTTPException(status_code=404, detail="质检结果不存在")
    return qc
