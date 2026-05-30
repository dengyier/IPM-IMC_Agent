"""跨阶段共用模型。"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class AgentRun(Base):
    """记录 LangGraph / Agent 一次执行的输入输出与中间步骤。"""

    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    graph_name: Mapped[str] = mapped_column(String(120), nullable=False)
    input: Mapped[dict] = mapped_column(JsonType, default=dict)
    output: Mapped[dict] = mapped_column(JsonType, default=dict)
    intermediate_steps: Mapped[list] = mapped_column(JsonType, default=list)
    status: Mapped[str] = mapped_column(String(40), default="succeeded")
    error_message: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(120))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
