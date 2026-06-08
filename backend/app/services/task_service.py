"""长任务编排：落库 + 后台线程执行，脱离请求生命周期。

为什么不用 FastAPI BackgroundTasks / 纯内存：建图实测 60+ 分钟、进程重启即丢，
任务状态必须落库（Task 表），由独立线程持有自己的 DB Session 执行，
前端通过 GET /api/tasks/{id} 轮询。

注意：work_fn 在后台线程中运行，会拿到一个**全新的** Session（不要复用请求里的
session，请求结束即关闭）。embeddings / llm / vector_store 均为 lru_cache 单例，
跨线程共享安全（无状态封装）。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import utc_now
from app.db.models import Task
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# 少量 worker 即可：这些任务以 LLM / IO 等待为主，且本地 SQLite 写并发不宜过高。
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="task")


class ProgressCallback:
    """进度回调类，用于在任务执行过程中更新进度。"""
    
    def __init__(self, db: Session, task_id: str):
        self.db = db
        self.task_id = task_id
    
    def update(self, progress: int, message: str | None = None) -> None:
        """更新任务进度（0-100）。"""
        task = self.db.get(Task, self.task_id)
        if task is not None:
            task.progress = max(10, min(99, progress))  # 限制在 10-99 之间
            if message:
                logger.info("Task %s: %d%% - %s", self.task_id, progress, message)
            self.db.commit()


# work_fn 接收后台线程的全新 Session 和进度回调，返回结果（pydantic 模型或 dict）。
WorkFn = Callable[[Session, ProgressCallback], BaseModel | dict[str, Any]]


def create_task(
    db: Session,
    task_type: str,
    *,
    input: dict[str, Any] | None = None,
    resource_id: str | None = None,
    tenant_id: str | None = None,
) -> Task:
    """在**请求 session**里创建任务记录并提交，使其立刻可被轮询。"""
    task = Task(
        tenant_id=tenant_id,
        task_type=task_type,
        status="running",
        progress=0,
        resource_id=resource_id,
        input=input or {},
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _serialize(result: BaseModel | dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, BaseModel):
        return result.model_dump(mode="json")
    return result


def _run(task_id: str, work_fn: WorkFn) -> None:
    """后台线程主体：独立 Session 执行 work_fn 并把状态/结果落库。"""
    db = SessionLocal()
    try:
        task = db.get(Task, task_id)
        if task is None:  # 理论上不会发生
            logger.error("task %s 不存在，放弃执行", task_id)
            return
        task.status = "running"
        task.progress = 10
        db.commit()

        # 创建进度回调
        progress_callback = ProgressCallback(db, task_id)

        try:
            result = work_fn(db, progress_callback)
        except ValueError as exc:  # 业务校验类错误
            db.rollback()
            _fail(db, task_id, str(exc))
            return
        except Exception as exc:  # noqa: BLE001 兜底，避免线程静默吞错
            db.rollback()
            logger.exception("task %s 执行异常", task_id)
            _fail(db, task_id, f"内部错误：{exc}")
            return

        task = db.get(Task, task_id)
        if task is not None:
            task.status = "succeeded"
            task.progress = 100
            task.result = _serialize(result)
            task.completed_at = utc_now()
            db.commit()
    finally:
        db.close()


def _fail(db: Session, task_id: str, detail: str) -> None:
    task = db.get(Task, task_id)
    if task is not None:
        task.status = "failed"
        task.error = detail
        task.completed_at = utc_now()
        db.commit()


def dispatch(task_id: str, work_fn: WorkFn) -> None:
    """把任务投递到后台线程池。立即返回，不阻塞请求。"""
    _executor.submit(_run, task_id, work_fn)
