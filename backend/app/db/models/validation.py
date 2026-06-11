"""验证卡模型。

验证卡是把一次 AI 对话或诊断结论沉淀为可执行验证计划的最小单元。
它不替代诊断报告，而是承接报告后的 7 天/30 天行动验证。
"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class ValidationCard(Base):
    __tablename__ = "validation_cards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), index=True)
    source_message_id: Mapped[str | None] = mapped_column(String(36), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    project_summary: Mapped[str] = mapped_column(Text, default="")
    core_judgment: Mapped[str] = mapped_column(Text, default="")
    biggest_uncertainty: Mapped[str] = mapped_column(Text, default="")
    target_customer: Mapped[str] = mapped_column(Text, default="")
    failure_reason: Mapped[str] = mapped_column(Text, default="")
    actions: Mapped[list] = mapped_column(JsonType, default=list)
    decision_criteria: Mapped[dict] = mapped_column(JsonType, default=dict)
    # achieved | not_achieved | partially_achieved
    result: Mapped[str | None] = mapped_column(String(40))
    actual_outcome: Mapped[str] = mapped_column(Text, default="")
    learnings: Mapped[str] = mapped_column(Text, default="")
    validated_at: Mapped[datetime | None] = mapped_column(DateTime)
    node_refs: Mapped[list] = mapped_column(JsonType, default=list)
    meta: Mapped[dict] = mapped_column(JsonType, default=dict)

    # draft | running | completed | archived
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
