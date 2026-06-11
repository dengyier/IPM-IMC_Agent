"""项目（Project）模型 —— 30天验证系统的核心聚合对象。

诊断报告、验证任务、复盘记录都挂在项目下。计数（诊断/任务/复盘次数）由查询聚合，
不落冗余列，避免维护不一致。
"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now

# 项目状态机（见 ProjectService.transition）
PROJECT_STATUSES = ("idea", "validating", "trial", "growth", "paused")
# 任务包类型
PROJECT_TASK_PACKS = ("new_project", "sales_growth", "ai_acquisition", "review")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(120))
    target_customer: Mapped[str] = mapped_column(Text, default="")
    current_problem: Mapped[str] = mapped_column(Text, default="")
    # new_project | sales_growth | ai_acquisition | review
    task_pack: Mapped[str] = mapped_column(String(40), default="new_project", nullable=False)
    # idea(想法期) | validating(验证期) | trial(试运营) | growth(增长期) | paused(暂停)
    status: Mapped[str] = mapped_column(String(40), default="idea", nullable=False)
    risk_profile: Mapped[dict] = mapped_column(JsonType, default=dict)
    meta: Mapped[dict] = mapped_column(JsonType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
