"""多租户组织模型。

租户 = 一个客户组织：
- type=enterprise：企业，含多名成员（企业管理层 / 企业员工），由超级管理员开通。
- type=individual：独立个人，成员数为 1，用户首次短信登录时自助创建。

平台超级管理员不属于任何业务租户（tenant_id 为空），可跨租户管理。
核心方法论内核为全平台共享，不属于任何租户。
"""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uid, utc_now


class Tenant(Base):
    """客户组织（企业 / 独立个人）。"""

    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="我的组织")
    # enterprise | individual
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    owner_user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    # 预留：企业自助邀请码（B 方案下一轮使用）
    invite_code: Mapped[str | None] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now
    )
