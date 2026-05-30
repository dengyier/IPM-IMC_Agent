"""Phase 2 外部信息进化 API 路由（资料吸收 + 审核 + 节点版本演进）。

核心约束：外部资料只进入扩展层与 expansion_chunks；任何扩展进入正式节点版本前
必须经过人工审核；未审核内容不得演进节点版本、不得覆盖核心字段。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_embeddings, get_expansion_store, get_llm, get_storage
from app.core.config import get_settings
from app.db.models import (
    ExpansionItem,
    ExpansionSource,
    KnowledgeNodeVersion,
    MethodologyNode,
    ReviewTask,
)
from app.db.session import get_db
from app.graphs.external_info_evolution_graph import ExternalInfoEvolutionGraph
from app.schemas.expansion import (
    AbsorbExpansionResult,
    EvolveNodeResult,
    ExpansionItemOut,
    ExpansionSourceOut,
    KnowledgeNodeVersionOut,
    ReviewDecisionRequest,
    ReviewDecisionResult,
    ReviewTaskOut,
    UploadExpansionResult,
)
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.review_service import ReviewService
from app.services.storage import LocalStorage
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/expansion", tags=["expansion"])

_ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".pptx"}


def _graph(
    db: Session,
    embeddings: EmbeddingProvider,
    expansion_store: VectorStore,
    llm: LLMService,
) -> ExternalInfoEvolutionGraph:
    return ExternalInfoEvolutionGraph(
        db=db,
        settings=get_settings(),
        embeddings=embeddings,
        expansion_store=expansion_store,
        llm=llm,
    )


# --------------------------------------------------------------------------- #
# sources
# --------------------------------------------------------------------------- #


@router.post("/sources/upload", response_model=UploadExpansionResult)
async def upload_expansion(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    source_type: str = Form("classmate_note"),
    submitted_by: str | None = Form(None),
    visibility: str = Form("team"),
    db: Session = Depends(get_db),
    storage: LocalStorage = Depends(get_storage),
) -> UploadExpansionResult:
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
    source = ExpansionSource(
        title=title or filename,
        source_type=source_type,
        file_path=str(saved),
        submitted_by=submitted_by,
        source_layer="expansion",
        visibility=visibility,
        status="uploaded",
        meta={"original_filename": filename, "size": len(content)},
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return UploadExpansionResult(source_id=source.id, title=source.title, status=source.status)


@router.get("/sources", response_model=list[ExpansionSourceOut])
def list_expansion_sources(db: Session = Depends(get_db)) -> list[ExpansionSource]:
    return db.query(ExpansionSource).order_by(ExpansionSource.created_at.desc()).all()


@router.post("/sources/{source_id}/absorb", response_model=AbsorbExpansionResult)
def absorb_source(
    source_id: str,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> AbsorbExpansionResult:
    source = db.get(ExpansionSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="来源不存在")
    try:
        return _graph(db, embeddings, expansion_store, llm).run_absorb(source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# items
# --------------------------------------------------------------------------- #


@router.get("/items", response_model=list[ExpansionItemOut])
def list_items(
    review_status: str | None = None,
    aligned_node_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[ExpansionItem]:
    query = db.query(ExpansionItem)
    if review_status:
        query = query.filter(ExpansionItem.review_status == review_status)
    if aligned_node_id:
        query = query.filter(ExpansionItem.aligned_node_id == aligned_node_id)
    return query.order_by(ExpansionItem.created_at.desc()).all()


# --------------------------------------------------------------------------- #
# node versions
# --------------------------------------------------------------------------- #


@router.post("/nodes/{node_id}/evolve", response_model=EvolveNodeResult)
def evolve_node(
    node_id: str,
    created_by: str | None = None,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> EvolveNodeResult:
    if not db.get(MethodologyNode, node_id):
        raise HTTPException(status_code=404, detail="节点不存在")
    try:
        return _graph(db, embeddings, expansion_store, llm).run_evolve(node_id, created_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/nodes/{node_id}/versions", response_model=list[KnowledgeNodeVersionOut])
def list_node_versions(
    node_id: str, db: Session = Depends(get_db)
) -> list[KnowledgeNodeVersion]:
    return (
        db.query(KnowledgeNodeVersion)
        .filter(KnowledgeNodeVersion.node_id == node_id)
        .order_by(KnowledgeNodeVersion.created_at)
        .all()
    )


# --------------------------------------------------------------------------- #
# review
# --------------------------------------------------------------------------- #

review_router = APIRouter(prefix="/api/review", tags=["review"])


@review_router.get("/tasks", response_model=list[ReviewTaskOut])
def list_review_tasks(
    status: str = "pending", db: Session = Depends(get_db)
) -> list[ReviewTask]:
    query = db.query(ReviewTask)
    if status != "all":
        query = query.filter(ReviewTask.status == status)
    return query.order_by(ReviewTask.created_at).all()


@review_router.post("/tasks/{task_id}/decide", response_model=ReviewDecisionResult)
def decide_review_task(
    task_id: str,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> ReviewDecisionResult:
    service = ReviewService(db)
    try:
        task, item = service.decide(
            task_id=task_id,
            decision=payload.decision,
            reviewer=payload.reviewer,
            comment=payload.comment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    node_version_id: str | None = None
    message = f"审核任务已 {task.status}。"

    if (
        payload.decision == "approved"
        and payload.evolve_on_approve
        and item.aligned_node_id
    ):
        db.commit()
        try:
            result = _graph(db, embeddings, expansion_store, llm).run_evolve(
                item.aligned_node_id, created_by=payload.reviewer
            )
            node_version_id = result.node_version_id
            message += f" 已触发节点版本演进 → {result.version}。"
        except ValueError:
            message += " 暂无可吸收的新扩展，未生成新版本。"
    else:
        db.commit()

    return ReviewDecisionResult(
        task_id=task.id,
        item_id=item.id,
        status=task.status,
        node_version_id=node_version_id,
        message=message,
    )
