"""决策病例库接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.decision_case import DecisionCaseOut
from app.services import decision_case_service

router = APIRouter(prefix="/api/decision-cases", tags=["decision-cases"])


@router.get("", response_model=list[DecisionCaseOut])
def list_decision_cases(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[DecisionCaseOut]:
    return decision_case_service.list_cases(db, user, limit=limit)
