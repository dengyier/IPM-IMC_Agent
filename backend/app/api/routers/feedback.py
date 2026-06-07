"""用户反馈路由：任意登录用户提交；超管查看与处理。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_super_admin
from app.db.base import utc_now
from app.db.models import Feedback
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.feedback import FeedbackCreate, FeedbackOut, FeedbackStatusUpdate

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut)
def create_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> Feedback:
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="反馈内容不能为空")
    feedback = Feedback(
        tenant_id=user.tenant_id,
        user_id=user.id,
        user_name=user.display_name,
        user_phone=user.phone,
        category=payload.category,
        content=content,
        contact=(payload.contact or None),
        page_url=(payload.page_url or None),
        user_agent=(payload.user_agent or None),
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


@router.get("", response_model=list[FeedbackOut])
def list_feedback(
    status: str | None = None,
    category: str | None = None,
    keyword: str | None = None,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_super_admin),
) -> list[Feedback]:
    """超管查看全部反馈（跨租户），可按状态、类型、关键词过滤。"""
    query = db.query(Feedback)
    if status in {"open", "resolved"}:
        query = query.filter(Feedback.status == status)
    if category in {"suggestion", "problem", "other"}:
        query = query.filter(Feedback.category == category)
    if keyword:
        like = f"%{keyword.strip()}%"
        query = query.filter(
            or_(
                Feedback.content.like(like),
                Feedback.contact.like(like),
                Feedback.user_name.like(like),
                Feedback.user_phone.like(like),
            )
        )
    return query.order_by(Feedback.created_at.desc()).all()


@router.patch("/{feedback_id}", response_model=FeedbackOut)
def update_feedback_status(
    feedback_id: str,
    payload: FeedbackStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_super_admin),
) -> Feedback:
    feedback = db.get(Feedback, feedback_id)
    if not feedback:
        raise HTTPException(status_code=404, detail="反馈不存在")
    feedback.status = payload.status
    feedback.admin_reply = (payload.admin_reply or None)
    feedback.handled_by = user.id
    feedback.handled_at = utc_now()
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback
