"""ProjectService —— 项目聚合的创建、归属校验与状态机。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import DiagnosisReport, Project, ValidationCard
from app.db.models.auth import AuthUser

# 项目状态机：仅相邻推进；任意态可暂停；暂停可恢复到任一进行态。
_FORWARD: dict[str, list[str]] = {
    "idea": ["validating"],
    "validating": ["trial"],
    "trial": ["growth"],
    "growth": [],
}


def can_transition(frm: str, to: str) -> bool:
    if frm == to:
        return True
    if to == "paused":
        return True
    if frm == "paused":
        return to in {"idea", "validating", "trial", "growth"}
    return to in _FORWARD.get(frm, [])


def _scope(user: AuthUser) -> str | None:
    """super_admin 不限租户；member 限本租户。与 tenant_scope 一致。"""
    return None if getattr(user, "role", None) == "super_admin" else user.tenant_id


def get_owned_project(db: Session, project_id: str, user: AuthUser) -> Project | None:
    project = db.get(Project, project_id)
    if not project:
        return None
    tid = _scope(user)
    if tid is not None and project.tenant_id != tid:
        return None
    return project


def resolve_or_create_for_diagnose(
    db: Session,
    user: AuthUser,
    *,
    project_id: str | None,
    title: str,
    task_pack: str | None,
) -> Project:
    """诊断入口：传 project_id 则校验归属并复用；否则自动建项目兜底。"""
    if project_id:
        project = get_owned_project(db, project_id, user)
        if project:
            return project
    project = Project(
        tenant_id=user.tenant_id,
        user_id=user.id,
        name=(title or "未命名项目").strip()[:255] or "未命名项目",
        task_pack=(task_pack or "new_project"),
        status="validating",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def report_count(db: Session, project_id: str) -> int:
    return (
        db.query(DiagnosisReport)
        .filter(DiagnosisReport.project_id == project_id)
        .count()
    )


def last_diagnosed_at(db: Session, project_id: str):
    row = (
        db.query(DiagnosisReport.created_at)
        .filter(DiagnosisReport.project_id == project_id)
        .order_by(DiagnosisReport.created_at.desc())
        .first()
    )
    return row[0] if row else None


def update_risk_profile(db: Session, project_id: str | None, risk_audit: list[dict]) -> None:
    if not project_id:
        return
    project = db.get(Project, project_id)
    if not project:
        return
    top_risks = []
    for item in risk_audit[:5]:
        if not isinstance(item, dict) or not str(item.get("risk") or "").strip():
            continue
        top_risks.append(
            {
                "risk": str(item.get("risk") or "").strip(),
                "severity": str(item.get("severity") or "medium"),
                "probability": str(item.get("probability") or "medium"),
                "mitigation": str(item.get("mitigation") or ""),
            }
        )
    project.risk_profile = {
        "top_risks": top_risks,
        "risk_count": len([item for item in risk_audit if isinstance(item, dict)]),
        "updated_at": _iso_now(),
    }
    db.add(project)
    db.flush()


def history_context(db: Session, project_id: str) -> str:
    """压缩同一项目的历史判断、假设与验证反馈，供下一轮推演使用。"""
    project = db.get(Project, project_id)
    if not project:
        return ""

    lines: list[str] = [
        f"项目历史档案：{project.name}",
        f"目标客户：{project.target_customer or '未填写'}",
        f"当前问题：{project.current_problem or '未填写'}",
    ]

    reports = (
        db.query(DiagnosisReport)
        .filter(DiagnosisReport.project_id == project_id)
        .order_by(DiagnosisReport.created_at.desc())
        .limit(5)
        .all()
    )
    if reports:
        lines.append("最近诊断判断：")
    for idx, report in enumerate(reports, start=1):
        summary = _dict_text(report.executive_summary, "one_sentence_judgement") or report.overall_summary
        recommendation = _compact_value(report.final_recommendation)
        assumptions = _compact_list(report.key_assumptions, limit=4)
        parts = [f"{idx}. {report.title}"]
        if summary:
            parts.append(f"判断：{summary}")
        if assumptions:
            parts.append(f"关键假设：{assumptions}")
        if recommendation:
            parts.append(f"建议：{recommendation}")
        lines.append("；".join(parts))

    cards = (
        db.query(ValidationCard)
        .filter(ValidationCard.project_id == project_id)
        .order_by(ValidationCard.updated_at.desc())
        .limit(8)
        .all()
    )
    if cards:
        lines.append("验证卡回填：")
    for card in cards:
        result = _result_label(card.result)
        outcome = _clip(card.actual_outcome or "", 160)
        learnings = _clip(card.learnings or "", 160)
        parts = [f"- {card.title}", f"状态：{result or card.status}"]
        if outcome:
            parts.append(f"实际结果：{outcome}")
        if learnings:
            parts.append(f"复盘学习：{learnings}")
        lines.append("；".join(parts))

    return _clip("\n".join(lines), 1500)


def _dict_text(value: dict | None, key: str) -> str:
    if not isinstance(value, dict):
        return ""
    return str(value.get(key) or "").strip()


def _compact_value(value) -> str:
    if isinstance(value, dict):
        preferred = [
            value.get("decision"),
            value.get("summary"),
            value.get("recommendation"),
            value.get("next_step"),
        ]
        text = "；".join(str(item).strip() for item in preferred if str(item or "").strip())
        if text:
            return _clip(text, 220)
        return _clip("；".join(f"{k}:{v}" for k, v in list(value.items())[:4]), 220)
    if isinstance(value, list):
        return _compact_list(value)
    return _clip(str(value or "").strip(), 220)


def _compact_list(value, *, limit: int = 5) -> str:
    if not isinstance(value, list):
        return _clip(str(value or "").strip(), 220)
    return "；".join(_clip(str(item), 80) for item in value[:limit] if str(item).strip())


def _result_label(value: str | None) -> str:
    return {
        "achieved": "达成",
        "not_achieved": "未达成",
        "partially_achieved": "部分达成",
    }.get(value or "", "")


def _clip(text: str, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else f"{text[:limit]}..."


def _iso_now() -> str:
    from app.db.base import utc_now

    return utc_now().isoformat()
