"""智能助手路由。"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    get_core_store,
    get_current_user,
    get_embeddings,
    get_llm,
    tenant_scope,
)
from app.db.base import utc_now
from app.db.models import AssistantConversation, AssistantMessage
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.assistant import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantConversationCreate,
    AssistantConversationOut,
    AssistantMessageOut,
    AssistantParseFileResponse,
)
from app.services.assistant_service import AssistantService
from app.services.document_parser import clean_text, parse_document_pages
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


def _title_from_question(question: str) -> str:
    title = " ".join(question.strip().replace("\n", " ").split())
    return title[:28] + ("..." if len(title) > 28 else "")


def _is_placeholder_title(title: str | None) -> bool:
    return (title or "").strip() in {"", "新会话", "历史会话"}


def _default_conv_id(tid: str | None) -> str:
    """每个租户一个独立的默认会话，避免跨租户共享 'default'。"""
    return "default" if tid is None else f"default-{tid}"


def _ensure_default_conversation(db: Session, tid: str | None) -> AssistantConversation:
    conv_id = _default_conv_id(tid)
    conversation = db.get(AssistantConversation, conv_id)
    if conversation:
        return conversation
    conversation = AssistantConversation(id=conv_id, title="新会话", tenant_id=tid)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _get_owned_conversation(
    db: Session, conversation_id: str, tid: str | None
) -> AssistantConversation | None:
    conversation = db.get(AssistantConversation, conversation_id)
    if not conversation:
        return None
    if tid is not None and conversation.tenant_id != tid:
        return None
    return conversation


def _get_or_create_conversation(
    db: Session, conversation_id: str | None, tid: str | None, question: str | None = None
) -> AssistantConversation:
    if conversation_id:
        if conversation_id == "default":
            return _ensure_default_conversation(db, tid)
        conversation = _get_owned_conversation(db, conversation_id, tid)
        if conversation:
            return conversation
    title = _title_from_question(question or "") if question else "新会话"
    conversation = AssistantConversation(title=title or "新会话", tenant_id=tid)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _to_conversation_out(
    conversation: AssistantConversation, message_count: int = 0
) -> AssistantConversationOut:
    return AssistantConversationOut(
        id=conversation.id,
        title=conversation.title,
        message_count=message_count,
        updated_at=conversation.updated_at,
        created_at=conversation.created_at,
    )


def _sync_placeholder_title(db: Session, conversation: AssistantConversation) -> None:
    """旧默认会话如果仍叫“历史会话/新会话”，用首条用户消息回填真实标题。"""
    if not _is_placeholder_title(conversation.title):
        return
    first_user_message = (
        db.query(AssistantMessage)
        .filter(
            AssistantMessage.conversation_id == conversation.id,
            AssistantMessage.role == "user",
        )
        .order_by(AssistantMessage.created_at.asc())
        .first()
    )
    if not first_user_message:
        return
    conversation.title = _title_from_question(first_user_message.content)
    db.add(conversation)


def _to_message_out(message: AssistantMessage) -> AssistantMessageOut:
    return AssistantMessageOut(
        id=message.id,
        role=message.role,
        content=message.content,
        attachments=message.attachments or [],
        node_refs=message.node_refs or [],
        suggested_questions=message.suggested_questions or [],
        used_llm=message.used_llm,
        action_label=message.action_label,
        action_href=message.action_href,
        created_at=message.created_at,
    )


def _conversation_history_for_llm(
    db: Session,
    conversation_id: str,
    limit: int = 12,
) -> list[dict[str, str]]:
    rows = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    history: list[dict[str, str]] = []
    for row in reversed(rows):
        content = row.content.strip()
        if not content:
            continue
        if row.attachments:
            attachment_names = "、".join(
                str(item.get("name", "")).strip()
                for item in row.attachments
                if isinstance(item, dict) and item.get("name")
            )
            if attachment_names:
                content = f"{content}\n随问题上传文件：{attachment_names}"
        history.append({"role": row.role, "content": content})
    return history


@router.get("/conversations", response_model=list[AssistantConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[AssistantConversationOut]:
    tid = tenant_scope(user)
    _ensure_default_conversation(db, tid)
    msg_q = db.query(AssistantMessage.conversation_id, func.count(AssistantMessage.id))
    if tid is not None:
        msg_q = msg_q.filter(AssistantMessage.tenant_id == tid)
    counts = dict(msg_q.group_by(AssistantMessage.conversation_id).all())
    conv_q = db.query(AssistantConversation).filter(
        AssistantConversation.is_archived.is_(False)
    )
    if tid is not None:
        conv_q = conv_q.filter(AssistantConversation.tenant_id == tid)
    rows = conv_q.order_by(AssistantConversation.updated_at.desc()).all()
    for row in rows:
        _sync_placeholder_title(db, row)
    db.commit()
    return [_to_conversation_out(row, int(counts.get(row.id, 0))) for row in rows]


@router.post("/conversations", response_model=AssistantConversationOut)
def create_conversation(
    payload: AssistantConversationCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> AssistantConversationOut:
    title = (payload.title or "新会话").strip() or "新会话"
    conversation = AssistantConversation(title=title[:80], tenant_id=user.tenant_id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _to_conversation_out(conversation, 0)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> Response:
    conversation = _get_owned_conversation(db, conversation_id, tenant_scope(user))
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.query(AssistantMessage).filter(
        AssistantMessage.conversation_id == conversation.id
    ).delete(synchronize_session=False)
    db.delete(conversation)
    db.commit()
    return Response(status_code=204)


@router.get("/messages", response_model=list[AssistantMessageOut])
def list_messages(
    conversation_id: str = "default",
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[AssistantMessageOut]:
    tid = tenant_scope(user)
    if conversation_id == "default":
        conversation_id = _ensure_default_conversation(db, tid).id
    elif not _get_owned_conversation(db, conversation_id, tid):
        raise HTTPException(status_code=404, detail="会话不存在")
    rows = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.created_at.asc())
        .all()
    )
    return [_to_message_out(row) for row in rows]


@router.post("/ask", response_model=AssistantAskResponse)
def ask(
    payload: AssistantAskRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> AssistantAskResponse:
    tid = user.tenant_id
    conversation = _get_or_create_conversation(
        db, payload.conversation_id, tenant_scope(user), payload.question
    )
    response = AssistantService(db, embeddings, core_store, llm).ask(
        question=payload.question,
        company_context=payload.company_context,
        conversation_history=_conversation_history_for_llm(db, conversation.id),
        tenant_id=tid,
    )
    response.conversation_id = conversation.id
    user_message = AssistantMessage(
        tenant_id=tid,
        conversation_id=conversation.id,
        role="user",
        content=payload.question.strip(),
        attachments=[attachment.model_dump(mode="json") for attachment in payload.attachments],
    )
    assistant_message = AssistantMessage(
        tenant_id=tid,
        conversation_id=conversation.id,
        role="assistant",
        content=response.answer,
        node_refs=[node.model_dump(mode="json") for node in response.node_refs],
        suggested_questions=response.suggested_questions,
        used_llm=response.used_llm,
        action_label=response.action_label,
        action_href=response.action_href,
    )
    if _is_placeholder_title(conversation.title):
        conversation.title = _title_from_question(payload.question)
    conversation.updated_at = utc_now()
    db.add(conversation)
    db.add(user_message)
    db.add(assistant_message)
    db.commit()
    return response


_PARSE_ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".pptx", ".xlsx"}
_PARSE_MAX_BYTES = 30 * 1024 * 1024
_PARSE_MAX_CHARS = 12000


@router.post("/parse-file", response_model=AssistantParseFileResponse)
def parse_file(
    file: UploadFile = File(...),
    user: AuthUser = Depends(get_current_user),
) -> AssistantParseFileResponse:
    """把上传文件解析为纯文本，供前端作为问答上下文（不入库、不建审核任务）。"""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _PARSE_ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="不支持的文件类型，仅支持 PDF/DOCX/PPTX/XLSX/TXT/MD。")
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="文件为空。")
    if len(data) > _PARSE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="文件过大（上限 30MB）。")

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        pages = parse_document_pages(tmp_path)
    except Exception as exc:  # noqa: BLE001 — 解析任何异常都转成 400 反馈
        raise HTTPException(status_code=400, detail=f"文件解析失败：{exc}") from exc
    finally:
        if tmp_path is not None:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    text = clean_text("\n".join(t for _, t in pages if t))
    truncated = len(text) > _PARSE_MAX_CHARS
    text = text[:_PARSE_MAX_CHARS]
    return AssistantParseFileResponse(
        filename=file.filename or "",
        chars=len(text),
        truncated=truncated,
        text=text,
    )
