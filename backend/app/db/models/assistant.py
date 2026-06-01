"""Persistent assistant conversation messages."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class AssistantConversation(Base):
    """A persisted assistant conversation."""

    __tablename__ = "assistant_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(160), default="新会话")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class AssistantMessage(Base):
    """A message in the default IMC&IPM assistant conversation."""

    __tablename__ = "assistant_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    conversation_id: Mapped[str] = mapped_column(String(80), default="default", index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    node_refs: Mapped[list] = mapped_column(JsonType, default=list)
    suggested_questions: Mapped[list] = mapped_column(JsonType, default=list)
    used_llm: Mapped[bool] = mapped_column(Boolean, default=False)
    action_label: Mapped[str | None] = mapped_column(String(120))
    action_href: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
