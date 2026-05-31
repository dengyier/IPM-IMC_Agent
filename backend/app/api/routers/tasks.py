"""长任务轮询 API：GET /api/tasks/{id}（+ 调试用列表）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Task
from app.db.session import get_db
from app.schemas.task import TaskOut

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    task_type: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> list[Task]:
    query = db.query(Task)
    if task_type:
        query = query.filter(Task.task_type == task_type)
    return query.order_by(Task.created_at.desc()).limit(max(1, min(limit, 100))).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db)) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task
