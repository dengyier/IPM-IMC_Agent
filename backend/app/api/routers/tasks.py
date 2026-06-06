"""长任务轮询 API：GET /api/tasks/{id}（+ 调试用列表）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, tenant_scope
from app.db.models import Task
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.task import TaskOut

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    task_type: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[Task]:
    tid = tenant_scope(user)
    query = db.query(Task)
    if tid is not None:
        query = query.filter(Task.tenant_id == tid)
    if task_type:
        query = query.filter(Task.task_type == task_type)
    return query.order_by(Task.created_at.desc()).limit(max(1, min(limit, 100))).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> Task:
    task = db.get(Task, task_id)
    tid = tenant_scope(user)
    if not task or (tid is not None and task.tenant_id != tid):
        raise HTTPException(status_code=404, detail="任务不存在")
    return task
