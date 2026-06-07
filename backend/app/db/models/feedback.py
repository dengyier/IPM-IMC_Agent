"""用户反馈模型。"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uid, utc_now


class Feedback(Base):
    """用户通过「意见反馈」入口提交的反馈。超管可在反馈管理页查看与处理。"""

    __tablename__ = "feedbacks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    # 冗余提交人信息，便于超管列表直接展示，无需再 join
    user_name: Mapped[str | None] = mapped_column(String(80))
    user_phone: Mapped[str | None] = mapped_column(String(40))
    # suggestion（建议）| problem（问题）| other（其它）
    category: Mapped[str] = mapped_column(String(40), default="suggestion", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[str | None] = mapped_column(String(120))
    page_url: Mapped[str | None] = mapped_column(String(500))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    # open（待处理）| resolved（已处理）
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    admin_reply: Mapped[str | None] = mapped_column(Text)
    handled_by: Mapped[str | None] = mapped_column(String(36))
    handled_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
