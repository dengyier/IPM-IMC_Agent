"""项目（Project）schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TaskPack = Literal["new_project", "sales_growth", "ai_acquisition", "review"]
ProjectStatus = Literal["idea", "validating", "trial", "growth", "paused"]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=120)
    target_customer: str = ""
    current_problem: str = ""
    task_pack: TaskPack = "new_project"


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    industry: str | None = Field(default=None, max_length=120)
    target_customer: str | None = None
    current_problem: str | None = None
    status: ProjectStatus | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    industry: str | None = None
    target_customer: str = ""
    current_problem: str = ""
    task_pack: str
    status: str
    risk_profile: dict = Field(default_factory=dict)
    tenant_id: str | None = None
    created_at: datetime
    updated_at: datetime
    # 聚合计数（实时统计，非冗余列）
    report_count: int = 0
    last_diagnosed_at: datetime | None = None

    model_config = {"from_attributes": True}
