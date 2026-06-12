"""Tianji-BACH v2 audit endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_llm
from app.db.models import TianjiEvidenceRecord, TianjiPrediction
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.tianji_bach import (
    TianjiBachAdjudicationOut,
    TianjiBachCaseOut,
    TianjiBachEvidenceOut,
    TianjiBachHypothesisOut,
    TianjiBachPredictionOut,
    TianjiSandboxResult,
)
from app.services import tianji_bach_service, tianji_sandbox_service, validation_card_service
from app.services.llm import LLMService

router = APIRouter(prefix="/api/tianji-bach", tags=["tianji-bach"])


@router.get("/cases/{card_id}", response_model=TianjiBachCaseOut)
def get_tianji_bach_case(
    card_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> TianjiBachCaseOut:
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")

    hypotheses = tianji_bach_service.list_hypotheses(db, card.id)
    adjudication = tianji_bach_service.adjudicate(db, card.id)
    replay = tianji_bach_service.replay_case(db, card.id) if hypotheses else {}
    evidence = (
        db.query(TianjiEvidenceRecord)
        .filter(TianjiEvidenceRecord.case_id == card.id)
        .order_by(TianjiEvidenceRecord.created_at.desc())
        .all()
    )
    predictions = (
        db.query(TianjiPrediction)
        .filter(TianjiPrediction.case_id == card.id)
        .order_by(TianjiPrediction.created_at.desc())
        .all()
    )
    replay_consistent = all(
        abs(replay.get(row.id, row.current_logodds) - row.current_logodds) < 0.0001
        for row in hypotheses
    )
    # 敏感性分析后的有效权重与决定性标记（来自裁决结果）
    sensitivity = {
        item["id"]: item for item in (adjudication or {}).get("hypotheses", []) if isinstance(item, dict)
    }
    meta = card.meta if isinstance(card.meta, dict) else {}
    sandbox = meta.get("sandbox") if isinstance(meta.get("sandbox"), dict) else None

    return TianjiBachCaseOut(
        case_id=card.id,
        adjudication=TianjiBachAdjudicationOut(**{k: adjudication[k] for k in TianjiBachAdjudicationOut.model_fields})
        if adjudication
        else None,
        hypotheses=[
            TianjiBachHypothesisOut(
                id=row.id,
                statement=row.statement,
                dimension=row.dimension,
                falsified_by=row.falsified_by,
                validated_by=row.validated_by,
                prior_logodds=row.prior_logodds,
                current_logodds=row.current_logodds,
                probability=round(tianji_bach_service.probability(row.current_logodds), 4),
                impact_weight=float(sensitivity.get(row.id, {}).get("impact_weight", row.impact_weight)),
                structural_weight=row.impact_weight,
                decisive=bool(sensitivity.get(row.id, {}).get("decisive", False)),
                status=row.status,
            )
            for row in hypotheses
        ],
        evidence=[TianjiBachEvidenceOut.model_validate(row) for row in evidence],
        predictions=[TianjiBachPredictionOut.model_validate(row) for row in predictions],
        replay_logodds=replay,
        replay_consistent=replay_consistent,
        sandbox=TianjiSandboxResult(**sandbox) if sandbox else None,
    )


@router.post("/cases/{card_id}/sandbox", response_model=TianjiSandboxResult)
def run_tianji_sandbox(
    card_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    llm: LLMService = Depends(get_llm),
) -> TianjiSandboxResult:
    """运行蒙特卡洛沙盘：从证据账本提取参数（缺参不编造）→ 模拟 → 结果入账。"""
    card = validation_card_service.get_owned_card(db, card_id, user)
    if not card:
        raise HTTPException(status_code=404, detail="验证卡不存在")
    result = tianji_sandbox_service.run_sandbox(db, card, llm)
    return TianjiSandboxResult(**result)
