"""ReviewService —— 人工审核闸口（外部扩展进入正式知识网络前的必经环节）。

负责：列出待审核任务、对任务做出 approve/reject 决策，并同步更新对应 ExpansionItem
的 review_status。审核通过后可触发节点版本演进（由调用方/图编排决定）。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import ExpansionItem, ExpansionSource, ReviewTask


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
        self._sync_source_status(item.source_id)
        self.db.flush()
        return task, item

    def bulk_decide(
        self,
        task_ids: list[str],
        decision: str,
        reviewer: str | None = None,
        comment: str | None = None,
    ) -> tuple[list[ReviewTask], list[ExpansionItem]]:
        """批量审核待处理任务。仅处理仍处于 pending 的任务。"""
        if decision not in {"approved", "rejected"}:
            raise ValueError("decision 必须为 approved 或 rejected。")
        if not task_ids:
            return [], []

        tasks = (
            self.db.query(ReviewTask)
            .filter(ReviewTask.id.in_(task_ids), ReviewTask.status == "pending")
            .all()
        )
        item_ids = [task.item_id for task in tasks]
        items_by_id = {
            item.id: item
            for item in self.db.query(ExpansionItem)
            .filter(ExpansionItem.id.in_(item_ids))
            .all()
        }

        now = datetime.utcnow()
        changed_tasks: list[ReviewTask] = []
        changed_items: list[ExpansionItem] = []
        source_ids: set[str] = set()
        for task in tasks:
            item = items_by_id.get(task.item_id)
            if not item:
                continue
            task.status = decision
            task.reviewer = reviewer
            task.decision_comment = comment
            task.reviewed_at = now
            item.review_status = decision
            self.db.add(task)
            self.db.add(item)
            changed_tasks.append(task)
            changed_items.append(item)
            source_ids.add(item.source_id)

        for source_id in source_ids:
            self._sync_source_status(source_id)
        self.db.flush()
        return changed_tasks, changed_items

    def _sync_source_status(self, source_id: str | None) -> None:
        """根据来源下扩展条目的审核状态，同步资料来源状态。"""
        if not source_id:
            return
        source = self.db.get(ExpansionSource, source_id)
        if not source:
            return
        # Session autoflush=False：先 flush，确保本次决策对 item.review_status 的改动
        # 已落库，下面的聚合查询才能读到最新状态（否则会读到旧的 pending）。
        self.db.flush()
        items = (
            self.db.query(ExpansionItem.review_status)
            .filter(ExpansionItem.source_id == source_id)
            .all()
        )
        statuses = [row[0] for row in items]
        if not statuses:
            source.status = "extraction_empty"
        elif any(status == "pending" for status in statuses):
            source.status = "pending_review"
        elif all(status == "rejected" for status in statuses):
            # 全部条目被驳回：整条资料视为已驳回，与"已审核（有采纳）"区分开
            source.status = "rejected"
        else:
            # 无待审且至少有一条通过 → 视为已采纳入库
            source.status = "reviewed"
        self.db.add(source)
