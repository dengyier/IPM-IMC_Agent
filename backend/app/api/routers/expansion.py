"""Phase 2 外部信息进化 API 路由（资料吸收 + 审核 + 节点版本演进）。

核心约束：外部资料只进入扩展层与 expansion_chunks；任何扩展进入正式节点版本前
必须经过人工审核；未审核内容不得演进节点版本、不得覆盖核心字段。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    get_embeddings,
    get_expansion_store,
    get_llm,
    get_storage,
    require_reviewer,
    require_super_admin,
    tenant_scope,
)
from app.core.config import get_settings
from app.db.models import (
    ExpansionItem,
    ExpansionSource,
    KnowledgeNodeVersion,
    MethodologyNode,
    ReviewTask,
)
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.services.auth_service import ROLE_SUPER_ADMIN
from app.graphs.external_info_evolution_graph import ExternalInfoEvolutionGraph
from app.schemas.expansion import (
    AbsorbExpansionResult,
    AlignedNodeBrief,
    BulkReviewDecisionRequest,
    BulkReviewDecisionResult,
    EvolveNodeResult,
    ExpansionItemDetailOut,
    ExpansionItemOut,
    ExpansionSourceBrief,
    ExpansionSourceOut,
    KnowledgeNodeVersionOut,
    ReviewDecisionRequest,
    ReviewDecisionResult,
    ReviewTaskDetailOut,
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
    user: AuthUser = Depends(get_current_user),
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
        tenant_id=user.tenant_id,
        title=title or filename,
        source_type=source_type,
        file_path=str(saved),
        submitted_by=submitted_by or user.phone,
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
def list_expansion_sources(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[ExpansionSource]:
    tid = tenant_scope(user)
    query = db.query(ExpansionSource)
    if tid is not None:
        query = query.filter(ExpansionSource.tenant_id == tid)
    return query.order_by(ExpansionSource.created_at.desc()).all()


@router.post("/sources/{source_id}/absorb", response_model=AbsorbExpansionResult)
def absorb_source(
    source_id: str,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
    user: AuthUser = Depends(get_current_user),
) -> AbsorbExpansionResult:
    tid = tenant_scope(user)
    source = db.get(ExpansionSource, source_id)
    if not source or (tid is not None and source.tenant_id != tid):
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
    user: AuthUser = Depends(get_current_user),
) -> list[ExpansionItem]:
    tid = tenant_scope(user)
    query = db.query(ExpansionItem)
    if tid is not None:
        query = query.filter(ExpansionItem.tenant_id == tid)
    if review_status:
        query = query.filter(ExpansionItem.review_status == review_status)
    if aligned_node_id:
        query = query.filter(ExpansionItem.aligned_node_id == aligned_node_id)
    return query.order_by(ExpansionItem.created_at.desc()).all()


def _build_item_detail(
    db: Session, item: ExpansionItem
) -> ExpansionItemDetailOut:
    """把扩展条目装配成详情：内联来源摘要 + 对齐节点摘要。"""
    detail = ExpansionItemDetailOut.model_validate(item)
    source = db.get(ExpansionSource, item.source_id)
    if source:
        detail.source = ExpansionSourceBrief.model_validate(source)
    if item.aligned_node_id:
        node = db.get(MethodologyNode, item.aligned_node_id)
        if node:
            detail.aligned_node = AlignedNodeBrief.model_validate(node)
    return detail


@router.get("/items/{item_id}", response_model=ExpansionItemDetailOut)
def get_item(
    item_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ExpansionItemDetailOut:
    tid = tenant_scope(user)
    item = db.get(ExpansionItem, item_id)
    if not item or (tid is not None and item.tenant_id != tid):
        raise HTTPException(status_code=404, detail="扩展条目不存在")
    return _build_item_detail(db, item)


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
    _admin: AuthUser = Depends(require_super_admin),
) -> EvolveNodeResult:
    # 节点版本演进会修改共享核心方法论，仅超级管理员可执行
    if not db.get(MethodologyNode, node_id):
        raise HTTPException(status_code=404, detail="节点不存在")
    try:
        return _graph(db, embeddings, expansion_store, llm).run_evolve(node_id, created_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/nodes/{node_id}/versions", response_model=list[KnowledgeNodeVersionOut])
def list_node_versions(
    node_id: str,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_super_admin),
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
    status: str = "pending",
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_reviewer),
) -> list[ReviewTask]:
    tid = tenant_scope(user)
    query = db.query(ReviewTask)
    if tid is not None:
        query = query.filter(ReviewTask.tenant_id == tid)
    if status != "all":
        query = query.filter(ReviewTask.status == status)
    return query.order_by(ReviewTask.created_at).all()


@review_router.get("/tasks/{task_id}", response_model=ReviewTaskDetailOut)
def get_review_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_reviewer),
) -> ReviewTaskDetailOut:
    """审核任务详情：任务字段 + 关联扩展条目（含来源、对齐节点），供详情面板一次取齐。"""
    tid = tenant_scope(user)
    task = db.get(ReviewTask, task_id)
    if not task or (tid is not None and task.tenant_id != tid):
        raise HTTPException(status_code=404, detail="审核任务不存在")
    detail = ReviewTaskDetailOut.model_validate(task)
    item = db.get(ExpansionItem, task.item_id)
    if item:
        detail.item = _build_item_detail(db, item)
    return detail


@review_router.post("/tasks/bulk-decide", response_model=BulkReviewDecisionResult)
def bulk_decide_review_tasks(
    payload: BulkReviewDecisionRequest,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
    user: AuthUser = Depends(require_reviewer),
) -> BulkReviewDecisionResult:
    tid = tenant_scope(user)
    task_ids = list(dict.fromkeys(payload.task_ids))
    if not task_ids:
        raise HTTPException(status_code=400, detail="请选择需要批量审核的任务。")

    query = db.query(ReviewTask.id).filter(
        ReviewTask.id.in_(task_ids),
        ReviewTask.status == "pending",
    )
    if tid is not None:
        query = query.filter(ReviewTask.tenant_id == tid)
    allowed_ids = [row[0] for row in query.all()]

    service = ReviewService(db)
    try:
        tasks, items = service.bulk_decide(
            task_ids=allowed_ids,
            decision=payload.decision,
            reviewer=payload.reviewer or user.phone,
            comment=payload.comment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    node_version_ids: list[str] = []
    node_ids = sorted(
        {
            item.aligned_node_id
            for item in items
            if item.aligned_node_id and payload.decision == "approved"
        }
    )
    db.commit()

    if payload.evolve_on_approve and user.role == ROLE_SUPER_ADMIN:
        for node_id in node_ids:
            try:
                result = _graph(db, embeddings, expansion_store, llm).run_evolve(
                    node_id, created_by=payload.reviewer or user.phone
                )
                node_version_ids.append(result.node_version_id)
            except ValueError:
                continue

    skipped_count = len(task_ids) - len(tasks)
    action = "通过" if payload.decision == "approved" else "拒绝"
    message = f"已批量{action} {len(tasks)} 条审核任务。"
    if node_version_ids:
        message += f" 已批量演进 {len(node_version_ids)} 个知识节点版本。"
    if skipped_count:
        message += f" {skipped_count} 条已跳过。"
    return BulkReviewDecisionResult(
        decision=payload.decision,
        requested_count=len(task_ids),
        updated_count=len(tasks),
        skipped_count=skipped_count,
        node_version_ids=node_version_ids,
        message=message,
    )


@review_router.post("/tasks/{task_id}/decide", response_model=ReviewDecisionResult)
def decide_review_task(
    task_id: str,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
    user: AuthUser = Depends(require_reviewer),
) -> ReviewDecisionResult:
    tid = tenant_scope(user)
    existing = db.get(ReviewTask, task_id)
    if not existing or (tid is not None and existing.tenant_id != tid):
        raise HTTPException(status_code=404, detail="审核任务不存在")
    service = ReviewService(db)
    try:
        task, item = service.decide(
            task_id=task_id,
            decision=payload.decision,
            reviewer=payload.reviewer or user.phone,
            comment=payload.comment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    node_version_id: str | None = None
    message = f"审核任务已 {task.status}。"

    # 节点版本演进会改写共享核心，仅超级管理员审核时才触发
    if (
        payload.decision == "approved"
        and payload.evolve_on_approve
        and user.role == ROLE_SUPER_ADMIN
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
