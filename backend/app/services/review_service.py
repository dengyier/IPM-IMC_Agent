"""ReviewService —— 人工审核闸口（外部扩展进入正式知识网络前的必经环节）。

负责：列出待审核任务、对任务做出 approve/reject 决策，并同步更新对应 ExpansionItem
的 review_status。审核通过后可触发节点版本演进（由调用方/图编排决定）。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import ExpansionItem, ReviewTask


class ReviewService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_pending(self) -> list[ReviewTask]:
        return (
            self.db.query(ReviewTask)
            .filter(ReviewTask.status == "pending")
            .order_by(ReviewTask.created_at)
            .all()
        )

    def get_task(self, task_id: str) -> ReviewTask | None:
        return self.db.get(ReviewTask, task_id)

    def decide(
        self,
        task_id: str,
        decision: str,
        reviewer: str | None = None,
        comment: str | None = None,
    ) -> tuple[ReviewTask, ExpansionItem]:
        """对审核任务做决策。decision ∈ {approved, rejected}。"""
        if decision not in {"approved", "rejected"}:
            raise ValueError("decision 必须为 approved 或 rejected。")
        task = self.db.get(ReviewTask, task_id)
        if not task:
            raise ValueError("审核任务不存在。")
        item = self.db.get(ExpansionItem, task.item_id)
        if not item:
            raise ValueError("审核任务对应的扩展单元不存在。")

        task.status = decision
        task.reviewer = reviewer
        task.decision_comment = comment
        task.reviewed_at = datetime.utcnow()
        self.db.add(task)

        item.review_status = decision
        self.db.add(item)
        self.db.flush()
        return task, item
