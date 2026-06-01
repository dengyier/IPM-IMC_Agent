"""System settings persisted for the admin settings page."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utc_now


class SystemSettings(Base):
    """Singleton row for editable system profile/basic settings."""

    __tablename__ = "system_settings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default="default")

    system_name: Mapped[str] = mapped_column(
        String(255), default="IMC&IPM 商业决策智能体"
    )
    system_short_name: Mapped[str] = mapped_column(String(120), default="IMC&IPM")
    system_version: Mapped[str] = mapped_column(String(40), default="v2.3.1")
    deployment_environment: Mapped[str] = mapped_column(String(80), default="生产环境")
    deployed_at: Mapped[str] = mapped_column(String(80), default="2025-03-15 10:30:00")
    timezone: Mapped[str] = mapped_column(
        String(120), default="(GMT+08:00) 北京，上海，香港"
    )

    company_name: Mapped[str] = mapped_column(String(255), default="智策科技有限公司")
    company_short_name: Mapped[str] = mapped_column(String(120), default="智策科技")
    company_website: Mapped[str] = mapped_column(
        String(255), default="https://www.zhicetec.com"
    )

    language: Mapped[str] = mapped_column(String(40), default="简体中文")
    date_format: Mapped[str] = mapped_column(String(40), default="YYYY-MM-DD")
    time_format: Mapped[str] = mapped_column(String(80), default="24 小时制 (HH:mm)")
    number_format: Mapped[str] = mapped_column(String(40), default="1,234.56")
    currency: Mapped[str] = mapped_column(String(40), default="人民币 (¥)")

    theme_mode: Mapped[str] = mapped_column(String(40), default="light")
    accent_color: Mapped[str] = mapped_column(String(20), default="#5B4BFF")
    nav_density: Mapped[str] = mapped_column(String(40), default="expanded")

    allow_registration: Mapped[bool] = mapped_column(Boolean, default=False)
    require_2fa: Mapped[bool] = mapped_column(Boolean, default=True)
    require_email_verification: Mapped[bool] = mapped_column(Boolean, default=False)
    audit_log_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_backup_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    backup_retention_days: Mapped[int] = mapped_column(Integer, default=30)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
