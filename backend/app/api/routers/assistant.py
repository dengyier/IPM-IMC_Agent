"""智能助手路由。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_core_store, get_embeddings, get_llm
from app.db.base import utc_now
from app.db.models import AssistantConversation, AssistantMessage
from app.db.session import get_db
from app.schemas.assistant import (
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantConversationCreate,
    AssistantConversationOut,
    AssistantMessageOut,
)
from app.services.assistant_service import AssistantService
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


def _title_from_question(question: str) -> str:
    title = question.strip().replace("\n", " ")
    return title[:28] + ("..." if len(title) > 28 else "")


def _ensure_default_conversation(db: Session) -> AssistantConversation:
    conversation = db.get(AssistantConversation, "default")
    if conversation:
        return conversation
    conversation = AssistantConversation(id="default", title="历史会话")
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _get_or_create_conversation(
    db: Session, conversation_id: str | None, question: str | None = None
) -> AssistantConversation:
    if conversation_id:
        conversation = db.get(AssistantConversation, conversation_id)
        if conversation:
            return conversation
    title = _title_from_question(question or "") if question else "新会话"
    conversation = AssistantConversation(title=title or "新会话")
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


def _to_message_out(message: AssistantMessage) -> AssistantMessageOut:
    return AssistantMessageOut(
        id=message.id,
        role=message.role,
        content=message.content,
        node_refs=message.node_refs or [],
        suggested_questions=message.suggested_questions or [],
        used_llm=message.used_llm,
        action_label=message.action_label,
        action_href=message.action_href,
        created_at=message.created_at,
    )


@router.get("/conversations", response_model=list[AssistantConversationOut])
def list_conversations(db: Session = Depends(get_db)) -> list[AssistantConversationOut]:
    _ensure_default_conversation(db)
    counts = dict(
        db.query(AssistantMessage.conversation_id, func.count(AssistantMessage.id))
        .group_by(AssistantMessage.conversation_id)
        .all()
    )
    rows = (
        db.query(AssistantConversation)
        .filter(AssistantConversation.is_archived.is_(False))
        .order_by(AssistantConversation.updated_at.desc())
        .all()
    )
    return [_to_conversation_out(row, int(counts.get(row.id, 0))) for row in rows]


@router.post("/conversations", response_model=AssistantConversationOut)
def create_conversation(
    payload: AssistantConversationCreate,
    db: Session = Depends(get_db),
) -> AssistantConversationOut:
    title = (payload.title or "新会话").strip() or "新会话"
    conversation = AssistantConversation(title=title[:80])
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _to_conversation_out(conversation, 0)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
) -> Response:
    conversation = db.get(AssistantConversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.query(AssistantMessage).filter(
        AssistantMessage.conversation_id == conversation_id
    ).delete(synchronize_session=False)
    db.delete(conversation)
    db.commit()
    return Response(status_code=204)


@router.get("/messages", response_model=list[AssistantMessageOut])
def list_messages(
    conversation_id: str = "default",
    db: Session = Depends(get_db),
) -> list[AssistantMessageOut]:
    if conversation_id == "default":
        _ensure_default_conversation(db)
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
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    llm: LLMService = Depends(get_llm),
) -> AssistantAskResponse:
    conversation = _get_or_create_conversation(db, payload.conversation_id, payload.question)
    response = AssistantService(db, embeddings, core_store, llm).ask(
        question=payload.question,
        company_context=payload.company_context,
    )
    response.conversation_id = conversation.id
    user_message = AssistantMessage(
        conversation_id=conversation.id,
        role="user",
        content=payload.question.strip(),
    )
    assistant_message = AssistantMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=response.answer,
        node_refs=[node.model_dump(mode="json") for node in response.node_refs],
        suggested_questions=response.suggested_questions,
        used_llm=response.used_llm,
        action_label=response.action_label,
        action_href=response.action_href,
    )
    if conversation.title == "新会话":
        conversation.title = _title_from_question(payload.question)
    conversation.updated_at = utc_now()
    db.add(conversation)
    db.add(user_message)
    db.add(assistant_message)
    db.commit()
    return response
