"""跨阶段共用模型。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class Task(Base):
    """长任务的落库状态：脱离请求生命周期，供 GET /api/tasks/{id} 轮询。

    与 AgentRun（图执行内部审计）分离：Task 面向前端，记录一次"提交→运行→结果"
    的可轮询状态；AgentRun 仍由各 graph 内部自建用于审计。
    """

    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    # 语义任务类型：methodology.process / methodology.build_kernel / diagnosis.diagnose ...
    task_type: Mapped[str] = mapped_column(String(80), nullable=False)
    # pending | running | succeeded | failed
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 关联的业务资源 id（source_id / report_id 等），便于前端跳转
    resource_id: Mapped[str | None] = mapped_column(String(36))
    input: Mapped[dict] = mapped_column(JsonType, default=dict)
    result: Mapped[dict | None] = mapped_column(JsonType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


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
