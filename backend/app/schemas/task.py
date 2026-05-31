"""长任务（异步）Pydantic v2 schemas。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

TaskStatus = Literal["pending", "running", "succeeded", "failed"]


class TaskCreated(BaseModel):
    """长任务接口的即时返回：前端据此拿到 task_id 去轮询。"""

    task_id: str
    status: TaskStatus = "running"


class TaskOut(BaseModel):
    """GET /api/tasks/{id} 轮询返回。"""

    id: str
    task_type: str
    status: TaskStatus
    progress: int = 0
    resource_id: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}
