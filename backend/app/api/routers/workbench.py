"""验证工作台接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.workbench import WorkbenchSummary
from app.services import workbench_service

router = APIRouter(prefix="/api/workbench", tags=["workbench"])


@router.get("/summary", response_model=WorkbenchSummary)
def get_workbench_summary(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> WorkbenchSummary:
    return workbench_service.get_summary(db, user)
