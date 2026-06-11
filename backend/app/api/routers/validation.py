"""验证卡接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import utc_now
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.validation import ValidationCardCreate, ValidationCardOut, ValidationCardUpdate
from app.services import validation_card_service

router = APIRouter(prefix="/api/validation-cards", tags=["validation-cards"])


@router.post("", response_model=ValidationCardOut)
def create_validation_card(
    payload: ValidationCardCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ValidationCardOut:
    card = validation_card_service.create_card(db, user, payload)
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
