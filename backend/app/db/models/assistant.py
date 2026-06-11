"""Persistent assistant conversation messages."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class AssistantConversation(Base):
    """A persisted assistant conversation."""

    __tablename__ = "assistant_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(160), default="新会话")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class AssistantMessage(Base):
    """A message in the default IMC&IPM assistant conversation."""

    __tablename__ = "assistant_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    conversation_id: Mapped[str] = mapped_column(String(80), default="default", index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list] = mapped_column(JsonType, default=list)
    node_refs: Mapped[list] = mapped_column(JsonType, default=list)
    suggested_questions: Mapped[list] = mapped_column(JsonType, default=list)
    tianji_simulation: Mapped[dict | None] = mapped_column(JsonType, default=dict)
    used_llm: Mapped[bool] = mapped_column(Boolean, default=False)
    action_label: Mapped[str | None] = mapped_column(String(120))
    action_href: Mapped[str | None] = mapped_column(String(255))
    deposited_source_id: Mapped[str | None] = mapped_column(String(36), index=True)
    deposited_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class AssistantFile(Base):
    """A file parsed into conversation-scoped assistant context."""

    __tablename__ = "assistant_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    conversation_id: Mapped[str] = mapped_column(String(80), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="ready")
    deposited_source_id: Mapped[str | None] = mapped_column(String(36), index=True)
    deposited_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class AssistantFileChunk(Base):
    """A parsed text chunk retrievable only within its assistant conversation."""

    __tablename__ = "assistant_file_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    conversation_id: Mapped[str] = mapped_column(String(80), index=True)
    file_id: Mapped[str] = mapped_column(String(36), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer)
    section_title: Mapped[str | None] = mapped_column(String(255))
    qdrant_point_id: Mapped[str] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
