"""用户反馈 schemas。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FeedbackCategory = Literal["suggestion", "problem", "other"]


class FeedbackCreate(BaseModel):
    category: FeedbackCategory = "suggestion"
    content: str = Field(..., min_length=1, max_length=2000)
    contact: str | None = Field(default=None, max_length=120)
    page_url: str | None = Field(default=None, max_length=500)
    user_agent: str | None = Field(default=None, max_length=500)


class FeedbackStatusUpdate(BaseModel):
    status: Literal["open", "resolved"]
    admin_reply: str | None = Field(default=None, max_length=2000)


class FeedbackOut(BaseModel):
    id: str
    category: str
    content: str
    contact: str | None = None
    page_url: str | None = None
    user_agent: str | None = None
    status: str
    admin_reply: str | None = None
    user_name: str | None = None
    user_phone: str | None = None
    tenant_id: str | None = None
    handled_by: str | None = None
    handled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
