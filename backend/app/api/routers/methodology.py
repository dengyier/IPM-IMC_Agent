"""Phase 1 方法论底座 API 路由。

核心约束：核心方法论资料 source_layer='imc_ipm_core'、visibility='internal_only'、
authority_level=100；这些接口供系统内部构建与查询知识内核使用。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_core_store, get_embeddings, get_llm, get_storage
from app.core.config import Settings, get_settings
from app.db.models import (
    MethodologyEdge,
    MethodologyNode,
    MethodologySource,
    ProblemRoutingRule,
)
from app.db.session import get_db
from app.graphs.methodology_kernel_graph import MethodologyKernelBuildGraph
from app.schemas.methodology import (
    BuildKernelResult,
    GenerateRoutingRulesResult,
    MethodologyEdgeOut,
    MethodologyNodeOut,
    MethodologySourceOut,
    ProblemRoutingRuleOut,
    ProcessSourceResult,
    UploadSourceResult,
)
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.problem_routing_service import ProblemRoutingService
from app.services.storage import LocalStorage
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/methodology", tags=["methodology"])

_ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".pptx"}


def _build_graph(
    db: Session,
    embeddings: EmbeddingProvider,
    core_store: VectorStore,
    llm: LLMService,
) -> MethodologyKernelBuildGraph:
    return MethodologyKernelBuildGraph(
        db=db,
        settings=get_settings(),
        embeddings=embeddings,
        core_store=core_store,
        llm=llm,
    )


def _get_source(db: Session, source_id: str) -> MethodologySource:
    source = db.get(MethodologySource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="来源不存在")
    return source


# --------------------------------------------------------------------------- #
# sources
# --------------------------------------------------------------------------- #


@router.post("/sources/upload", response_model=UploadSourceResult)
async def upload_source(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    source_type: str = Form("courseware"),
    course_session: str | None = Form(None),
    db: Session = Depends(get_db),
    storage: LocalStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> UploadSourceResult:
    filename = file.filename or "upload"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 {suffix}，仅支持 {sorted(_ALLOWED_SUFFIXES)}",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    saved = storage.save(filename, content)
    source = MethodologySource(
        title=title or filename,
        source_type=source_type,
        file_path=str(saved),
        course_session=course_session,
        source_layer="imc_ipm_core",
        visibility="internal_only",
        authority_level=100,
        status="uploaded",
        meta={"original_filename": filename, "size": len(content)},
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return UploadSourceResult(source_id=source.id, title=source.title, status=source.status)


@router.get("/sources", response_model=list[MethodologySourceOut])
def list_sources(db: Session = Depends(get_db)) -> list[MethodologySource]:
    return (
        db.query(MethodologySource)
        .order_by(MethodologySource.created_at.desc())
        .all()
    )


@router.post("/sources/{source_id}/process", response_model=ProcessSourceResult)
def process_source(
    source_id: str,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> ProcessSourceResult:
    source = _get_source(db, source_id)
    graph = _build_graph(db, embeddings, core_store, llm)
    try:
        return graph.run_process(source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sources/{source_id}/build-kernel", response_model=BuildKernelResult)
def build_kernel(
    source_id: str,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> BuildKernelResult:
    source = _get_source(db, source_id)
    graph = _build_graph(db, embeddings, core_store, llm)
    try:
        return graph.run_build(source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# nodes / edges
# --------------------------------------------------------------------------- #


@router.get("/nodes", response_model=list[MethodologyNodeOut])
def list_nodes(
    category: str | None = None,
    db: Session = Depends(get_db),
) -> list[MethodologyNode]:
    query = db.query(MethodologyNode).filter(MethodologyNode.status == "active")
    if category:
        query = query.filter(MethodologyNode.node_category == category)
    return query.order_by(MethodologyNode.created_at.desc()).all()


@router.get("/nodes/{node_id}", response_model=MethodologyNodeOut)
def get_node(node_id: str, db: Session = Depends(get_db)) -> MethodologyNode:
    node = db.get(MethodologyNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    return node


@router.get("/edges", response_model=list[MethodologyEdgeOut])
def list_edges(
    node_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[MethodologyEdge]:
    query = db.query(MethodologyEdge)
    if node_id:
        query = query.filter(
            (MethodologyEdge.source_node_id == node_id)
            | (MethodologyEdge.target_node_id == node_id)
        )
    return query.all()


# --------------------------------------------------------------------------- #
# routing rules
# --------------------------------------------------------------------------- #


@router.post("/routing-rules/generate", response_model=GenerateRoutingRulesResult)
def generate_routing_rules(
    db: Session = Depends(get_db),
) -> GenerateRoutingRulesResult:
    rules = ProblemRoutingService(db).generate_rules(replace_existing=True)
    db.commit()
    out = [ProblemRoutingRuleOut.model_validate(r) for r in rules]
    return GenerateRoutingRulesResult(rule_count=len(out), rules=out)


@router.get("/routing-rules", response_model=list[ProblemRoutingRuleOut])
def list_routing_rules(db: Session = Depends(get_db)) -> list[ProblemRoutingRule]:
    return (
        db.query(ProblemRoutingRule)
        .order_by(ProblemRoutingRule.routing_priority)
        .all()
    )
