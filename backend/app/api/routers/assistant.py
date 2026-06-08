"""智能助手路由。"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import (
    get_assistant_file_store,
    get_core_store,
    get_current_user,
    get_embeddings,
    get_expansion_store,
    get_llm,
    tenant_scope,
)
from app.core.config import get_settings
from app.db.base import uid, utc_now
from app.db.models import (
    AssistantConversation,
    AssistantFile,
    AssistantFileChunk,
    AssistantMessage,
    ExpansionItem,
    ExpansionSource,
    ReviewTask,
)
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.graphs.external_info_evolution_graph import ExternalInfoEvolutionGraph
from app.schemas.assistant import (
    AssistantAttachment,
    AssistantAskRequest,
    AssistantAskResponse,
    AssistantConversationCreate,
    AssistantConversationOut,
    AssistantDepositFileRequest,
    AssistantDepositFileResponse,
    AssistantDepositMessageRequest,
    AssistantDepositMessageResponse,
    AssistantMessageOut,
    AssistantParseFileResponse,
)
from app.services.assistant_service import AssistantService
from app.services.document_parser import chunk_pages, clean_text, parse_document_pages
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


def _to_message_out(
    message: AssistantMessage,
    source_counts: dict[str, int] | None = None,
    db: Session | None = None,
) -> AssistantMessageOut:
    # 已沉淀的附件卡片：实时重算「待审核」计数（沉淀时写入的是冻结值，审核后会过期）。
    attachments = message.attachments or []
    if db is not None and attachments:
        rebuilt: list = []
        for att in attachments:
            sid = att.get("deposited_source_id") if isinstance(att, dict) else None
            if sid:
                counts = _source_counts(db, sid)
                att = {
                    **att,
                    "item_count": counts["item_count"],
                    "review_task_count": counts["review_task_count"],
                    "source_status": counts["source_status"],
                }
            rebuilt.append(att)
        attachments = rebuilt
    return AssistantMessageOut(
        id=message.id,
        role=message.role,
        content=message.content,
        attachments=attachments,
        node_refs=message.node_refs or [],
        suggested_questions=message.suggested_questions or [],
        used_llm=message.used_llm,
        action_label=message.action_label,
        action_href=message.action_href,
        deposited_source_id=message.deposited_source_id,
        item_count=(source_counts or {}).get("item_count"),
        review_task_count=(source_counts or {}).get("review_task_count"),
        source_status=(source_counts or {}).get("source_status"),
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


def _attachment_file_ids(attachments: list[AssistantAttachment]) -> list[str]:
    file_ids: list[str] = []
    seen: set[str] = set()
    for attachment in attachments:
        file_id = (attachment.file_id or "").strip()
        if file_id and file_id not in seen:
            seen.add(file_id)
            file_ids.append(file_id)
    return file_ids


def _text_terms(text: str) -> set[str]:
    terms: set[str] = set()
    for token in re.findall(r"[\u4e00-\u9fff]+|[a-zA-Z0-9_]{2,}", text.lower()):
        if len(token) <= 12:
            terms.add(token)
        if re.search(r"[\u4e00-\u9fff]", token) and len(token) > 2:
            terms.update(token[i : i + 2] for i in range(len(token) - 1))
    return terms


def _lexical_score(query_terms: set[str], text: str) -> float:
    if not query_terms:
        return 0.0
    chunk_terms = _text_terms(text[:2500])
    if not chunk_terms:
        return 0.0
    overlap = len(query_terms & chunk_terms)
    return overlap / max(len(query_terms), 1)


def _retrieve_conversation_file_context(
    db: Session,
    embeddings: EmbeddingProvider,
    file_store: VectorStore,
    conversation_id: str,
    question: str,
    attachments: list[AssistantAttachment],
    tenant_id: str | None,
    limit: int = 10,
) -> str:
    """召回当前会话上传文件的相关片段，不进入正式知识库。"""
    file_ids = _attachment_file_ids(attachments)
    query_vector = embeddings.embed_text(question)
    hits_by_chunk: dict[str, tuple[float, dict]] = {}

    if file_ids:
        for file_id in file_ids:
            for hit in file_store.search(query_vector, limit=6, must_match={"file_id": file_id}):
                payload = hit.payload or {}
                chunk_id = str(payload.get("chunk_id") or hit.id)
                if chunk_id not in hits_by_chunk or hit.score > hits_by_chunk[chunk_id][0]:
                    hits_by_chunk[chunk_id] = (hit.score, payload)
    else:
        for hit in file_store.search(
            query_vector,
            limit=limit,
            must_match={"conversation_id": conversation_id},
        ):
            payload = hit.payload or {}
            chunk_id = str(payload.get("chunk_id") or hit.id)
            hits_by_chunk[chunk_id] = (hit.score, payload)

    chunk_q = db.query(AssistantFileChunk).filter(
        AssistantFileChunk.conversation_id == conversation_id
    )
    if tenant_id is not None:
        chunk_q = chunk_q.filter(AssistantFileChunk.tenant_id == tenant_id)
    if file_ids:
        chunk_q = chunk_q.filter(AssistantFileChunk.file_id.in_(file_ids))
    candidate_rows = chunk_q.order_by(AssistantFileChunk.created_at.desc()).limit(300).all()

    rows_by_id = {row.id: row for row in candidate_rows}
    query_terms = _text_terms(question)
    for row in candidate_rows:
        score = _lexical_score(query_terms, row.chunk_text)
        if score <= 0:
            continue
        existing = hits_by_chunk.get(row.id)
        if existing is None or score > existing[0]:
            hits_by_chunk[row.id] = (
                score,
                {
                    "chunk_id": row.id,
                    "file_id": row.file_id,
                    "filename": row.filename,
                    "chunk_index": row.chunk_index,
                    "page_number": row.page_number,
                    "section_title": row.section_title,
                    "text": row.chunk_text,
                },
            )

    file_reference_hint = any(hint in question for hint in ("文件", "附件", "合同", "方案", "文档", "这份"))
    if file_ids or file_reference_hint:
        for row in sorted(candidate_rows, key=lambda item: (item.file_id, item.chunk_index))[:6]:
            if row.id in hits_by_chunk:
                continue
            hits_by_chunk[row.id] = (
                0.01,
                {
                    "chunk_id": row.id,
                    "file_id": row.file_id,
                    "filename": row.filename,
                    "chunk_index": row.chunk_index,
                    "page_number": row.page_number,
                    "section_title": row.section_title,
                    "text": row.chunk_text,
                },
            )

    if not hits_by_chunk:
        return ""

    snippets: list[str] = []
    for _, payload in sorted(hits_by_chunk.values(), key=lambda item: item[0], reverse=True)[:limit]:
        chunk_id = str(payload.get("chunk_id") or "")
        row = rows_by_id.get(chunk_id)
        filename = str(payload.get("filename") or (row.filename if row else "上传文件"))
        text = str(payload.get("text") or (row.chunk_text if row else "")).strip()
        if not text:
            continue
        page = payload.get("page_number") or (row.page_number if row else None)
        section = str(payload.get("section_title") or (row.section_title if row else "") or "").strip()
        where = []
        if page:
            where.append(f"第 {page} 页")
        if section:
            where.append(section[:60])
        where_text = f"（{'，'.join(where)}）" if where else ""
        snippets.append(f"文件《{filename}》相关片段{where_text}：\n{text[:900]}")

    return "\n\n".join(snippets)[:9000]


def _source_counts(db: Session, source_id: str) -> dict[str, object]:
    source = db.get(ExpansionSource, source_id)
    return {
        "item_count": db.query(ExpansionItem).filter(ExpansionItem.source_id == source_id).count(),
        # review_task_count 表示「仍待审核」的任务数：审核通过/驳回后递减，归零即全部审完。
        "review_task_count": (
            db.query(ReviewTask)
            .join(ExpansionItem, ReviewTask.item_id == ExpansionItem.id)
            .filter(
                ExpansionItem.source_id == source_id,
                ReviewTask.status == "pending",
            )
            .count()
        ),
        # source_status：pending_review / reviewed（有采纳）/ rejected（全部驳回）/ extraction_empty
        "source_status": source.status if source else None,
    }


def _sync_deposited_attachment_meta(
    db: Session,
    assistant_file: AssistantFile,
    source_id: str,
    item_count: int,
    review_task_count: int,
) -> None:
    """把沉淀结果回写到会话消息里的附件卡片，便于刷新后仍能看到状态。"""
    rows = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == assistant_file.conversation_id)
        .all()
    )
    for message in rows:
        attachments = message.attachments or []
        changed = False
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            if attachment.get("file_id") != assistant_file.id:
                continue
            attachment["status"] = "deposited"
            attachment["deposited_source_id"] = source_id
            attachment["item_count"] = item_count
            attachment["review_task_count"] = review_task_count
            changed = True
        if changed:
            flag_modified(message, "attachments")
            db.add(message)


def _assistant_file_as_deposit_text(
    assistant_file: AssistantFile,
    chunks: list[AssistantFileChunk],
) -> str:
    lines = [
        f"# {assistant_file.filename}",
        "",
        f"- 来源：IMC&IPM 智能助手对话附件",
        f"- 会话 ID：{assistant_file.conversation_id}",
        f"- 原始文件字数：{assistant_file.char_count}",
        f"- 原始片段数：{assistant_file.chunk_count}",
        "",
    ]
    for chunk in chunks:
        where = []
        if chunk.page_number:
            where.append(f"第 {chunk.page_number} 页")
        if chunk.section_title:
            where.append(chunk.section_title)
        suffix = f"（{' / '.join(where)}）" if where else ""
        lines.extend(
            [
                f"## 片段 {chunk.chunk_index + 1}{suffix}",
                "",
                chunk.chunk_text.strip(),
                "",
            ]
        )
    return "\n".join(lines).strip() + "\n"


def _previous_user_message(db: Session, assistant_message: AssistantMessage) -> AssistantMessage | None:
    return (
        db.query(AssistantMessage)
        .filter(
            AssistantMessage.conversation_id == assistant_message.conversation_id,
            AssistantMessage.role == "user",
            AssistantMessage.created_at <= assistant_message.created_at,
        )
        .order_by(AssistantMessage.created_at.desc())
        .first()
    )


def _message_source_title(
    conversation: AssistantConversation | None,
    user_message: AssistantMessage | None,
    assistant_message: AssistantMessage,
    override: str | None = None,
) -> str:
    if override and override.strip():
        return override.strip()[:255]
    if user_message and user_message.content.strip():
        return _title_from_question(user_message.content)[:255]
    if conversation and conversation.title.strip():
        return conversation.title.strip()[:255]
    return _title_from_question(assistant_message.content)[:255] or "对话结果沉淀"


def _assistant_message_as_deposit_text(
    conversation: AssistantConversation | None,
    assistant_message: AssistantMessage,
    user_message: AssistantMessage | None,
) -> str:
    lines = [
        f"# {_message_source_title(conversation, user_message, assistant_message)}",
        "",
        "- 来源：IMC&IPM 智能助手对话结果",
        f"- 会话 ID：{assistant_message.conversation_id}",
        f"- 助手消息 ID：{assistant_message.id}",
        f"- 生成方式：{'DeepSeek + 核心知识节点' if assistant_message.used_llm else '本地兜底 + 核心知识节点'}",
        "",
    ]
    if user_message:
        lines.extend(
            [
                "## 用户原始问题",
                "",
                user_message.content.strip(),
                "",
            ]
        )
        if user_message.attachments:
            names = [
                str(item.get("name", "")).strip()
                for item in user_message.attachments
                if isinstance(item, dict) and item.get("name")
            ]
            if names:
                lines.extend(["### 随问题上传的文件", "", *[f"- {name}" for name in names], ""])

    lines.extend(["## 助手回答", "", assistant_message.content.strip(), ""])

    if assistant_message.node_refs:
        lines.extend(["## 引用知识节点", ""])
        for node in assistant_message.node_refs:
            if not isinstance(node, dict):
                continue
            name = str(node.get("name") or node.get("node_name") or "").strip()
            category = str(node.get("category") or "").strip()
            if name:
                suffix = f"（{category}）" if category else ""
                lines.append(f"- {name}{suffix}")
        lines.append("")

    if assistant_message.suggested_questions:
        lines.extend(["## 建议继续追问", ""])
        for question in assistant_message.suggested_questions:
            if str(question).strip():
                lines.append(f"- {str(question).strip()}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


@router.get("/conversations", response_model=list[AssistantConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[AssistantConversationOut]:
    tid = tenant_scope(user)
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
    rows = [
        row
        for row in rows
        if not (row.id.startswith("default") and int(counts.get(row.id, 0)) == 0)
    ]
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
    db.query(AssistantFileChunk).filter(
        AssistantFileChunk.conversation_id == conversation.id
    ).delete(synchronize_session=False)
    db.query(AssistantFile).filter(
        AssistantFile.conversation_id == conversation.id
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
    return [
        _to_message_out(
            row,
            _source_counts(db, row.deposited_source_id) if row.deposited_source_id else None,
            db=db,
        )
        for row in rows
    ]


@router.post("/ask", response_model=AssistantAskResponse)
def ask(
    payload: AssistantAskRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    core_store: VectorStore = Depends(get_core_store),
    assistant_file_store: VectorStore = Depends(get_assistant_file_store),
    llm: LLMService = Depends(get_llm),
) -> AssistantAskResponse:
    tid = user.tenant_id
    conversation = _get_or_create_conversation(
        db, payload.conversation_id, tenant_scope(user), payload.question
    )
    file_context = _retrieve_conversation_file_context(
        db=db,
        embeddings=embeddings,
        file_store=assistant_file_store,
        conversation_id=conversation.id,
        question=payload.question,
        attachments=payload.attachments,
        tenant_id=tenant_scope(user),
    )
    response = AssistantService(db, embeddings, core_store, llm).ask(
        question=payload.question,
        company_context=payload.company_context,
        file_context=file_context,
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
    db.flush()
    response.assistant_message_id = assistant_message.id
    db.commit()
    return response


_PARSE_ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".pptx", ".xlsx"}
_PARSE_MAX_BYTES = 30 * 1024 * 1024


@router.post("/parse-file", response_model=AssistantParseFileResponse)
def parse_file(
    file: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    assistant_file_store: VectorStore = Depends(get_assistant_file_store),
) -> AssistantParseFileResponse:
    """把上传文件解析为会话级临时知识库（不进入正式资料中心/人工审核）。"""
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
    if not text:
        raise HTTPException(status_code=400, detail="未能从该文件解析出文本内容。")
    parsed_chunks = [chunk for chunk in chunk_pages(pages) if chunk.text.strip()]
    if not parsed_chunks:
        raise HTTPException(status_code=400, detail="未能从该文件切分出可检索片段。")

    tid = user.tenant_id
    conversation = _get_or_create_conversation(
        db, conversation_id, tenant_scope(user), question=None
    )
    assistant_file = AssistantFile(
        tenant_id=tid,
        conversation_id=conversation.id,
        filename=file.filename or "",
        content_type=file.content_type,
        file_size=len(data),
        char_count=len(text),
        chunk_count=len(parsed_chunks),
        status="ready",
    )
    db.add(assistant_file)
    db.flush()

    chunk_rows: list[AssistantFileChunk] = []
    vector_texts = [chunk.text for chunk in parsed_chunks]
    vectors = embeddings.embed_texts(vector_texts)
    points = []
    for chunk, vector in zip(parsed_chunks, vectors, strict=False):
        chunk_id = uid()
        point_id = uid()
        row = AssistantFileChunk(
            id=chunk_id,
            tenant_id=tid,
            conversation_id=conversation.id,
            file_id=assistant_file.id,
            filename=assistant_file.filename,
            chunk_index=chunk.chunk_index,
            chunk_text=chunk.text,
            page_number=chunk.page_number,
            section_title=chunk.section_title or chunk.topic,
            qdrant_point_id=point_id,
        )
        chunk_rows.append(row)
        points.append(
            (
                point_id,
                vector,
                {
                    "chunk_id": chunk_id,
                    "file_id": assistant_file.id,
                    "conversation_id": conversation.id,
                    "tenant_id": tid,
                    "filename": assistant_file.filename,
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "section_title": row.section_title,
                    "text": chunk.text,
                    "source_layer": "assistant_file",
                    "visibility": "conversation",
                },
            )
        )

    db.add_all(chunk_rows)
    assistant_file_store.upsert(points)
    conversation.updated_at = utc_now()
    db.add(conversation)
    db.commit()
    db.refresh(assistant_file)
    return AssistantParseFileResponse(
        file_id=assistant_file.id,
        conversation_id=conversation.id,
        filename=file.filename or "",
        chars=assistant_file.char_count,
        chunk_count=assistant_file.chunk_count,
        status=assistant_file.status,
        truncated=False,
        text="",
    )


@router.post("/files/{file_id}/deposit", response_model=AssistantDepositFileResponse)
def deposit_file_to_expansion(
    file_id: str,
    payload: AssistantDepositFileRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> AssistantDepositFileResponse:
    """把会话临时附件沉淀为正式资料，并进入扩展审核链路。"""
    tid = tenant_scope(user)
    query = db.query(AssistantFile).filter(AssistantFile.id == file_id)
    if tid is not None:
        query = query.filter(AssistantFile.tenant_id == tid)
    assistant_file = query.first()
    if not assistant_file:
        raise HTTPException(status_code=404, detail="附件不存在或无权访问")

    if assistant_file.deposited_source_id:
        source = db.get(ExpansionSource, assistant_file.deposited_source_id)
        # 已驳回的沉淀允许「重新提交」：跳过早返回，走下方重新沉淀流程生成新审核任务。
        if (
            source
            and (tid is None or source.tenant_id == tid)
            and source.status != "rejected"
        ):
            counts = _source_counts(db, source.id)
            item_count = int(counts["item_count"] or 0)
            review_task_count = int(counts["review_task_count"] or 0)
            _sync_deposited_attachment_meta(
                db,
                assistant_file,
                source.id,
                item_count,
                review_task_count,
            )
            db.commit()
            return AssistantDepositFileResponse(
                file_id=assistant_file.id,
                source_id=source.id,
                title=source.title,
                status=source.status,
                chunk_count=assistant_file.chunk_count,
                item_count=item_count,
                review_task_count=review_task_count,
                vector_backend=expansion_store.backend,
                message="该附件已沉淀为正式资料，可前往人工审核台处理。",
            )

    chunks = (
        db.query(AssistantFileChunk)
        .filter(AssistantFileChunk.file_id == assistant_file.id)
        .order_by(AssistantFileChunk.chunk_index.asc())
        .all()
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="该附件没有可沉淀的解析片段")

    settings = get_settings()
    deposit_dir = Path(settings.storage_dir) / "assistant-deposits"
    deposit_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", assistant_file.filename).strip("_")
    if not safe_name:
        safe_name = "assistant-file"
    deposit_path = deposit_dir / f"{assistant_file.id}_{safe_name}.md"
    deposit_path.write_text(_assistant_file_as_deposit_text(assistant_file, chunks), encoding="utf-8")

    source = ExpansionSource(
        tenant_id=assistant_file.tenant_id,
        title=(payload.title or assistant_file.filename or "对话附件沉淀资料").strip()[:255],
        source_type=payload.source_type or "practice_feedback",
        file_path=str(deposit_path),
        submitted_by=user.phone,
        source_layer="expansion",
        visibility=payload.visibility or "team",
        status="uploaded",
        meta={
            "deposited_from": "assistant_file",
            "assistant_file_id": assistant_file.id,
            "assistant_conversation_id": assistant_file.conversation_id,
            "original_filename": assistant_file.filename,
            "char_count": assistant_file.char_count,
            "chunk_count": assistant_file.chunk_count,
        },
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    chunk_count = assistant_file.chunk_count
    embedded_count = 0
    item_count = 0
    review_task_count = 0
    vector_backend = expansion_store.backend
    status = source.status
    if payload.auto_absorb:
        try:
            result = ExternalInfoEvolutionGraph(
                db=db,
                settings=settings,
                embeddings=embeddings,
                expansion_store=expansion_store,
                llm=llm,
            ).run_absorb(source)
            chunk_count = result.chunk_count
            embedded_count = result.embedded_count
            item_count = result.item_count
            review_task_count = result.review_task_count
            vector_backend = result.vector_backend
            status = result.status
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    assistant_file.deposited_source_id = source.id
    assistant_file.deposited_at = utc_now()
    assistant_file.status = "deposited"
    db.add(assistant_file)
    _sync_deposited_attachment_meta(db, assistant_file, source.id, item_count, review_task_count)
    db.commit()

    return AssistantDepositFileResponse(
        file_id=assistant_file.id,
        source_id=source.id,
        title=source.title,
        status=status,
        chunk_count=chunk_count,
        embedded_count=embedded_count,
        item_count=item_count,
        review_task_count=review_task_count,
        vector_backend=vector_backend,
        message="已沉淀为正式资料，并进入人工审核流程。",
    )


@router.post("/messages/{message_id}/deposit", response_model=AssistantDepositMessageResponse)
def deposit_message_to_expansion(
    message_id: str,
    payload: AssistantDepositMessageRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    embeddings: EmbeddingProvider = Depends(get_embeddings),
    expansion_store: VectorStore = Depends(get_expansion_store),
    llm: LLMService = Depends(get_llm),
) -> AssistantDepositMessageResponse:
    """把助手回答沉淀为正式资料，并进入扩展审核链路。"""
    tid = tenant_scope(user)
    query = db.query(AssistantMessage).filter(AssistantMessage.id == message_id)
    if tid is not None:
        query = query.filter(AssistantMessage.tenant_id == tid)
    assistant_message = query.first()
    if not assistant_message or assistant_message.role != "assistant":
        raise HTTPException(status_code=404, detail="助手回答不存在或无权访问")
    if not assistant_message.content.strip():
        raise HTTPException(status_code=400, detail="该回答内容为空，无法沉淀")

    if assistant_message.deposited_source_id:
        source = db.get(ExpansionSource, assistant_message.deposited_source_id)
        # 已驳回的沉淀允许「重新提交」：跳过早返回，走下方重新沉淀流程生成新审核任务。
        if (
            source
            and (tid is None or source.tenant_id == tid)
            and source.status != "rejected"
        ):
            counts = _source_counts(db, source.id)
            return AssistantDepositMessageResponse(
                message_id=assistant_message.id,
                source_id=source.id,
                title=source.title,
                status=source.status,
                item_count=int(counts["item_count"] or 0),
                review_task_count=int(counts["review_task_count"] or 0),
                vector_backend=expansion_store.backend,
                message="该对话结果已沉淀为正式资料，可前往人工审核台处理。",
            )

    conversation = _get_owned_conversation(db, assistant_message.conversation_id, tid)
    user_message = _previous_user_message(db, assistant_message)
    title = _message_source_title(conversation, user_message, assistant_message, payload.title)

    settings = get_settings()
    deposit_dir = Path(settings.storage_dir) / "assistant-message-deposits"
    deposit_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", title).strip("_")[:80]
    if not safe_title:
        safe_title = "assistant-message"
    deposit_path = deposit_dir / f"{assistant_message.id}_{safe_title}.md"
    deposit_path.write_text(
        _assistant_message_as_deposit_text(conversation, assistant_message, user_message),
        encoding="utf-8",
    )

    source = ExpansionSource(
        tenant_id=assistant_message.tenant_id,
        title=title,
        source_type=payload.source_type or "practice_feedback",
        file_path=str(deposit_path),
        submitted_by=user.phone,
        source_layer="expansion",
        visibility=payload.visibility or "team",
        status="uploaded",
        meta={
            "deposited_from": "assistant_message",
            "assistant_message_id": assistant_message.id,
            "assistant_conversation_id": assistant_message.conversation_id,
            "user_message_id": user_message.id if user_message else None,
            "used_llm": assistant_message.used_llm,
            "node_ref_count": len(assistant_message.node_refs or []),
        },
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    chunk_count = 0
    embedded_count = 0
    item_count = 0
    review_task_count = 0
    vector_backend = expansion_store.backend
    status = source.status
    if payload.auto_absorb:
        try:
            result = ExternalInfoEvolutionGraph(
                db=db,
                settings=settings,
                embeddings=embeddings,
                expansion_store=expansion_store,
                llm=llm,
            ).run_absorb(source)
            chunk_count = result.chunk_count
            embedded_count = result.embedded_count
            item_count = result.item_count
            review_task_count = result.review_task_count
            vector_backend = result.vector_backend
            status = result.status
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    assistant_message.deposited_source_id = source.id
    assistant_message.deposited_at = utc_now()
    db.add(assistant_message)
    db.commit()

    return AssistantDepositMessageResponse(
        message_id=assistant_message.id,
        source_id=source.id,
        title=source.title,
        status=status,
        chunk_count=chunk_count,
        embedded_count=embedded_count,
        item_count=item_count,
        review_task_count=review_task_count,
        vector_backend=vector_backend,
        message="已将对话结果沉淀为正式资料，并进入人工审核流程。",
    )
