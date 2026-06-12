"""决策病例库聚合服务。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Project, ValidationCard
from app.db.models.auth import AuthUser
from app.schemas.decision_case import DecisionCaseAsset, DecisionCaseOut


def _scope(user: AuthUser) -> str | None:
    return None if getattr(user, "role", None) == "super_admin" else user.tenant_id


def list_cases(db: Session, user: AuthUser, *, limit: int = 20) -> list[DecisionCaseOut]:
    query = db.query(ValidationCard)
    tid = _scope(user)
    if tid is not None:
        query = query.filter(ValidationCard.tenant_id == tid)
    cards = (
        query.filter(ValidationCard.status == "completed")
        .order_by(ValidationCard.validated_at.desc().nullslast(), ValidationCard.updated_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    project_ids = [card.project_id for card in cards if card.project_id]
    projects = {}
    if project_ids:
        projects = {row.id: row for row in db.query(Project).filter(Project.id.in_(project_ids)).all()}
    return [_case_from_card(card, projects.get(card.project_id or "")) for card in cards]


def _case_from_card(card: ValidationCard, project: Project | None) -> DecisionCaseOut:
    meta = card.meta if isinstance(card.meta, dict) else {}
    review = meta.get("day7_review") if isinstance(meta.get("day7_review"), dict) else {}
    decision = str(review.get("final_decision") or _decision_from_result(card.result))
    planned = ""
    if project and isinstance(project.meta, dict):
        planned = str(project.meta.get("planned_investment") or "")
    planned = planned or str(meta.get("planned_investment") or "")
    saved = planned if decision == "pause" else ""
    patterns = _patterns(card, review)
    return DecisionCaseOut(
        id=f"case-{card.id}",
        project_id=card.project_id,
        validation_card_id=card.id,
        title=project.name if project else card.title,
        industry=project.industry if project else None,
        decision=_decision_label(decision),
        evidence_grade=str(meta.get("evidence_grade") or _evidence_grade(review)),
        planned_investment=planned,
        saved_investment_estimate=saved,
        biggest_uncertainty=card.biggest_uncertainty,
        final_outcome=card.actual_outcome,
        key_learning=card.learnings,
        failure_patterns=patterns,
        assets=[
            DecisionCaseAsset(label="方法卡", kind="method"),
            DecisionCaseAsset(label="风险卡", kind="risk"),
            DecisionCaseAsset(label="访谈模板", kind="interview_template"),
            DecisionCaseAsset(label="渠道验证动作", kind="channel_action"),
        ],
        reviewed_at=card.validated_at,
    )


def _decision_from_result(result: str | None) -> str:
    return {
        "achieved": "continue",
        "partially_achieved": "adjust",
        "not_achieved": "pause",
    }.get(result or "", "adjust")


def _decision_label(decision: str) -> str:
    return {
        "continue": "继续",
        "adjust": "调整",
        "pause": "暂停",
    }.get(decision, "调整")


def _evidence_grade(review: dict) -> str:
    paid = _int(review.get("paid_intent_count"), 0)
    interviews = _int(review.get("interview_count"), 0)
    if paid >= 3:
        return "A"
    if paid >= 1 or interviews >= 10:
        return "B"
    if interviews >= 5:
        return "C"
    return "D"


def _patterns(card: ValidationCard, review: dict) -> list[str]:
    rows: list[str] = []
    if card.failure_reason:
        rows.append(card.failure_reason)
    rejection_reasons = review.get("rejection_reasons") if isinstance(review, dict) else []
    if isinstance(rejection_reasons, list):
        rows.extend(str(item) for item in rejection_reasons[:3] if str(item).strip())
    return rows[:4]


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
