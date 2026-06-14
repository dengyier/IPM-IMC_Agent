"""验证卡接口。"""

from __future__ import annotations

import re
from pathlib import Path as _Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_llm, get_reviewer_pool
from app.core.config import get_settings
from app.db.base import utc_now
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.validation import (
    ValidationActionPatch,
    ValidationCardCreate,
    ValidationCardOut,
    ValidationCardUpdate,
    ValidationReviewSubmit,
)
from app.services import validation_card_service
from app.services.llm import LLMService

router = APIRouter(prefix="/api/validation-cards", tags=["validation-cards"])


@router.post("", response_model=ValidationCardOut)
def create_validation_card(
    payload: ValidationCardCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    llm: LLMService = Depends(get_llm),
) -> ValidationCardOut:
    card = validation_card_service.create_card(db, user, payload, llm=llm)
    return ValidationCardOut.model_validate(card)


@router.get("", response_model=list[ValidationCardOut])
def list_validation_cards(
    project_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[ValidationCardOut]:
    cards = validation_card_service.list_cards(db, user, project_id=project_id, status=status)
    return [ValidationCardOut.model_validate(card) for card in cards]


@router.get("/{card_id}", response_model=ValidationCardOut)
def get_validation_card(
    card_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ValidationCardOut:
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    return ValidationCardOut.model_validate(card)


@router.patch("/{card_id}", response_model=ValidationCardOut)
def update_validation_card(
    card_id: str,
    payload: ValidationCardUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ValidationCardOut:
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    if payload.title is not None:
        card.title = payload.title.strip() or card.title
    if payload.status is not None:
        card.status = payload.status
    if payload.actions is not None:
        card.actions = [action.model_dump(mode="json") for action in payload.actions]
    if payload.decision_criteria is not None:
        card.decision_criteria = payload.decision_criteria.model_dump(mode="json")
    feedback_touched = False
    if payload.result is not None:
        card.result = payload.result
        feedback_touched = True
        if card.status == "running":
            card.status = "completed"
    if payload.actual_outcome is not None:
        card.actual_outcome = payload.actual_outcome.strip()
        feedback_touched = True
    if payload.learnings is not None:
        card.learnings = payload.learnings.strip()
        feedback_touched = True
    if payload.validated_at is not None:
        card.validated_at = payload.validated_at
    elif feedback_touched and card.validated_at is None:
        card.validated_at = utc_now()
    db.add(card)
    db.commit()
    db.refresh(card)
    return ValidationCardOut.model_validate(card)


@router.patch("/{card_id}/actions/{action_index}", response_model=ValidationCardOut)
def update_validation_action(
    card_id: str,
    action_index: int,
    payload: ValidationActionPatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    llm: LLMService = Depends(get_llm),
    reviewers: tuple[LLMService, ...] = Depends(get_reviewer_pool),
) -> ValidationCardOut:
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    try:
        card = validation_card_service.update_action(db, card, action_index, payload, llm=llm, reviewers=reviewers)
    except IndexError:
        raise HTTPException(status_code=404, detail="验证动作不存在") from None
    return ValidationCardOut.model_validate(card)


@router.post("/{card_id}/review", response_model=ValidationCardOut)
def submit_validation_review(
    card_id: str,
    payload: ValidationReviewSubmit,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ValidationCardOut:
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    card = validation_card_service.submit_review(db, card, payload)
    return ValidationCardOut.model_validate(card)


@router.post("/{card_id}/attachments")
async def upload_evidence_attachment(
    card_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """上传证据附件，返回 URL 供前端拼入 evidence_item.attachment_url。"""
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    settings = get_settings()
    upload_dir = _Path(settings.storage_dir) / "evidence_attachments" / card_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_upload_name(file.filename)
    dest = upload_dir / safe_name
    # 去重：已存在则加序号
    counter = 1
    stem, suffix = _Path(safe_name).stem, _Path(safe_name).suffix
    while dest.exists():
        dest = upload_dir / f"{stem}_{counter}{suffix}"
        counter += 1
    content_bytes = await file.read()
    dest.write_bytes(content_bytes)
    return {
        "url": f"/uploads/evidence_attachments/{card_id}/{dest.name}",
        "name": file.filename,
        "size": len(content_bytes),
    }


def _safe_upload_name(filename: str | None) -> str:
    """Keep uploaded evidence attachments inside the card directory."""
    raw = _Path(filename or "attachment").name.strip() or "attachment"
    safe = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff]", "_", raw)
    return safe[:160] or "attachment"
