"""验证工作台聚合服务。

工作台不是新的业务主库，而是把项目、验证卡、风险与复盘状态聚合成首页视图。
所有数值均由真实数据派生：没有项目/验证卡时返回空视图，由前端展示引导空态。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.base import utc_now
from app.db.models import Project, ValidationCard
from app.db.models.auth import AuthUser
from app.services import tianji_bach_service
from app.services.evidence_target import infer_evidence_target
from app.schemas.workbench import (
    WorkbenchAction,
    WorkbenchBachHypothesis,
    WorkbenchBachSnapshot,
    WorkbenchCaseAsset,
    WorkbenchColdReview,
    WorkbenchEvidenceStatus,
    WorkbenchProject,
    WorkbenchSummary,
    WorkbenchTimelineItem,
    WorkbenchWorldModel,
)


TIMELINE_LABELS = [
    "提交任务",
    "生成验证卡",
    "客户访谈",
    "渠道测试",
    "付费意向",
    "单位经济",
    "证据汇总",
    "复盘决策",
]

def _scope(user: AuthUser) -> str | None:
    return None if getattr(user, "role", None) == "super_admin" else user.tenant_id


def get_summary(db: Session, user: AuthUser) -> WorkbenchSummary:
    project = _latest_project(db, user)
    card = _latest_card(db, user, project.id if project else None)
    current_day = _current_day(card)
    actions = _actions(card)
    evidence = _evidence_status(actions)
    cold_review = _cold_review(db, project, card, actions, evidence)

    return WorkbenchSummary(
        has_data=bool(project or card),
        current_project=_project_out(project, card),
        current_card_id=card.id if card else None,
        current_day=current_day,
        total_days=7,
        final_decision=_final_decision(card),
        next_action=_next_action(card, actions),
        evidence_updated_at=card.updated_at if card else None,
        timeline=_timeline(current_day, card),
        actions=actions,
        cold_review=cold_review,
        evidence_status=evidence,
        case_assets=_case_assets(card),
        bach=_bach_snapshot(db, card),
        world_model=_world_model(project, card, actions, evidence, cold_review),
    )


def _latest_project(db: Session, user: AuthUser) -> Project | None:
    query = db.query(Project)
    tid = _scope(user)
    if tid is not None:
        query = query.filter(Project.tenant_id == tid)
    return query.order_by(Project.updated_at.desc()).first()


def _latest_card(db: Session, user: AuthUser, project_id: str | None) -> ValidationCard | None:
    query = db.query(ValidationCard)
    tid = _scope(user)
    if tid is not None:
        query = query.filter(ValidationCard.tenant_id == tid)
    if project_id:
        scoped = query.filter(ValidationCard.project_id == project_id).order_by(ValidationCard.updated_at.desc()).first()
        if scoped:
            return scoped
    return query.order_by(ValidationCard.updated_at.desc()).first()


def _project_out(project: Project | None, card: ValidationCard | None) -> WorkbenchProject | None:
    if project:
        meta = project.meta if isinstance(project.meta, dict) else {}
        return WorkbenchProject(
            id=project.id,
            name=project.name,
            industry=project.industry,
            current_problem=project.current_problem,
            target_customer=project.target_customer,
            task_pack=project.task_pack,
            status=project.status,
            planned_investment=meta.get("planned_investment"),
            decision_deadline=meta.get("decision_deadline"),
            updated_at=project.updated_at,
        )
    if card:
        meta = card.meta if isinstance(card.meta, dict) else {}
        return WorkbenchProject(
            id=card.project_id,
            name=card.title,
            current_problem=card.project_summary,
            target_customer=card.target_customer,
            status="validating",
            planned_investment=meta.get("planned_investment"),
            decision_deadline=meta.get("decision_deadline"),
            updated_at=card.updated_at,
        )
    return None


def _current_day(card: ValidationCard | None) -> int:
    """按验证卡创建时间推算真实天数：创建当天为 Day 1（生成验证卡）。"""
    if not card:
        return 0
    meta = card.meta if isinstance(card.meta, dict) else {}
    value = meta.get("current_day")
    try:
        return max(0, min(int(value), 7))
    except (TypeError, ValueError):
        pass
    if card.status == "completed":
        return 7
    # created_at 与 utc_now 同为系统统一的东八区 naive 时间，可直接相减
    created = card.created_at.replace(tzinfo=None) if card.created_at else None
    elapsed = (utc_now().replace(tzinfo=None) - created).days if created else 0
    return max(1, min(1 + elapsed, 7))


def _timeline(current_day: int, card: ValidationCard | None) -> list[WorkbenchTimelineItem]:
    completed_until = 8 if card and card.status == "completed" else max(0, current_day)
    rows: list[WorkbenchTimelineItem] = []
    for day, label in enumerate(TIMELINE_LABELS):
        if day < completed_until and day != current_day:
            status = "done"
        elif day == current_day and card:
            status = "current"
        else:
            status = "pending"
        rows.append(WorkbenchTimelineItem(day=day, label=label, status=status))
    return rows


def _actions(card: ValidationCard | None) -> list[WorkbenchAction]:
    raw_actions = card.actions if card and isinstance(card.actions, list) else []
    rows: list[WorkbenchAction] = []
    for idx, item in enumerate(raw_actions):
        if not isinstance(item, dict):
            continue
        evidence_items = item.get("evidence_items") if isinstance(item.get("evidence_items"), list) else []
        evidence_count = max(len(evidence_items), _int(item.get("evidence_count"), 0))
        success_metric = str(item.get("success_metric") or item.get("success_criteria") or "形成可用于继续/调整/暂停的判断依据。")
        evidence_target = infer_evidence_target(
            success_metric,
            item.get("target"),
            item.get("objective"),
            explicit=item.get("evidence_target"),
        )
        rows.append(
            WorkbenchAction(
                node_id=str(item.get("node_id") or f"n{idx + 1}"),
                parent_id=item.get("parent_id"),
                node_type=str(item.get("node_type") or ("root" if idx == 0 else "action")),
                branch_condition=str(item.get("branch_condition") or ""),
                title=str(item.get("title") or item.get("objective") or f"验证动作 {idx + 1}")[:40],
                objective=str(item.get("objective") or ""),
                success_metric=success_metric,
                grounded_on=str(item.get("grounded_on") or ""),
                target=str(item.get("target") or ""),
                baseline=str(item.get("baseline") or ""),
                owner=item.get("owner") or "项目负责人",
                day_range=str(item.get("day_range") or item.get("duration") or f"Day {idx + 2}"),
                status=str(item.get("status") or "todo"),
                progress=_int(item.get("progress"), 0),
                evidence_count=evidence_count,
                evidence_target=evidence_target,
                missing_evidence_count=max(0, evidence_target - evidence_count),
                evidence_items=evidence_items,
            )
        )
    return rows


def _evidence_status(actions: list[WorkbenchAction]) -> WorkbenchEvidenceStatus:
    if not actions:
        return WorkbenchEvidenceStatus(existing=0, missing=0, pending=0, grade="—")
    existing = sum(max(action.evidence_count, 0) for action in actions)
    target = sum(max(action.evidence_target, 1) for action in actions)
    missing = sum(max(action.missing_evidence_count, 0) for action in actions)
    pending = len([action for action in actions if action.status != "done"])
    done_ratio = 1 - pending / len(actions)
    if existing >= target and done_ratio >= 1:
        grade = "A"
    elif existing >= target * 2 // 3:
        grade = "B"
    elif existing >= target // 3:
        grade = "C"
    else:
        grade = "D"
    return WorkbenchEvidenceStatus(existing=existing, missing=missing, pending=pending, grade=grade)


def _world_model(
    project: Project | None,
    card: ValidationCard | None,
    actions: list[WorkbenchAction],
    evidence: WorkbenchEvidenceStatus,
    cold_review: WorkbenchColdReview,
) -> WorkbenchWorldModel:
    return WorkbenchWorldModel(
        player_role=_player_role(project, card),
        main_quest=_main_quest(project, card),
        resource_gaps=_resource_gaps(actions, evidence),
        active_rules=_active_rules(card, evidence),
        risk_signals=_risk_signals(actions, evidence, cold_review),
        next_quests=_next_quests(card, actions),
    )


def _player_role(project: Project | None, card: ValidationCard | None) -> str:
    if project and project.target_customer:
        return project.target_customer
    if card and card.target_customer:
        return card.target_customer
    return "经营决策者"


def _main_quest(project: Project | None, card: ValidationCard | None) -> str:
    if card and card.title:
        return card.title
    if project and project.current_problem:
        return project.current_problem
    if project and project.name:
        return f"验证「{project.name}」是否值得继续投入"
    return "输入关键经营决策，生成7天验证主线"


def _resource_gaps(actions: list[WorkbenchAction], evidence: WorkbenchEvidenceStatus) -> list[str]:
    if not actions:
        return ["缺少可验证的行动节点"]
    gaps = [
        f"「{action.title}」还缺 {action.missing_evidence_count} 条证据"
        for action in actions
        if action.missing_evidence_count > 0
    ][:3]
    if gaps:
        return gaps
    if evidence.grade in {"A", "B"}:
        return ["证据资源基本够用，进入复盘判断"]
    return ["证据资源不足，需要补充客户、渠道或付费信号"]


def _active_rules(card: ValidationCard | None, evidence: WorkbenchEvidenceStatus) -> list[str]:
    if not card:
        return ["没有验证卡时，不能进入投入判断"]
    return [
        "7天验证周期内，只用真实证据推进判断",
        f"当前证据等级为 {evidence.grade}，缺口为 {evidence.missing} 条",
        "继续、调整或暂停必须回到验证卡结果沉淀",
    ]


def _risk_signals(
    actions: list[WorkbenchAction],
    evidence: WorkbenchEvidenceStatus,
    cold_review: WorkbenchColdReview,
) -> list[str]:
    signals = [item for item in cold_review.reasons if item][:3]
    if signals:
        return signals
    pending = [action.title for action in actions if action.status != "done"][:2]
    if pending:
        return [f"仍有未完成任务：{title}" for title in pending]
    if evidence.missing > 0:
        return [f"证据总缺口仍有 {evidence.missing} 条"]
    return ["暂未发现新的高优先级风险信号"]


def _next_quests(card: ValidationCard | None, actions: list[WorkbenchAction]) -> list[str]:
    if not card:
        return ["生成第一张7天验证卡"]
    quests = [
        f"完成「{action.title}」并补齐证据"
        for action in actions
        if action.status != "done"
    ][:3]
    if quests:
        return quests
    return ["进入第7天复盘，形成继续/调整/暂停决策"]


def _bach_snapshot(db: Session, card: ValidationCard | None) -> WorkbenchBachSnapshot | None:
    if not card:
        return None
    try:
        adjudication = tianji_bach_service.adjudicate(db, card.id)
        hypotheses = tianji_bach_service.list_hypotheses(db, card.id)
        replay = tianji_bach_service.replay_case(db, card.id) if hypotheses else {}
    except Exception:  # noqa: BLE001
        return None
    if not adjudication:
        return None
    replay_consistent = all(
        abs(replay.get(row.id, row.current_logodds) - row.current_logodds) < 0.0001
        for row in hypotheses
    )
    return WorkbenchBachSnapshot(
        verdict=adjudication["verdict"],
        probability=int(round(adjudication["probability"] * 100)),
        kill_criteria=adjudication["kill_criteria"],
        hypotheses=[
            WorkbenchBachHypothesis(
                id=row["id"],
                statement=row["statement"],
                dimension=row["dimension"],
                probability=int(round(row["probability"] * 100)),
                impact_weight=row["impact_weight"],
                status=row["status"],
            )
            for row in adjudication["hypotheses"][:5]
        ],
        replay_consistent=replay_consistent,
    )


VERDICT_LABELS = {
    "continue": ("可小额继续验证", "low"),
    "adjust": ("建议调整后再投入", "medium"),
    "pause": ("暂不建议直接投入", "high"),
}


def _cold_review(
    db: Session,
    project: Project | None,
    card: ValidationCard | None,
    actions: list[WorkbenchAction],
    evidence: WorkbenchEvidenceStatus,
) -> WorkbenchColdReview:
    if not card:
        return WorkbenchColdReview(verdict="尚未开始验证", confidence=0, reasons=[], risk_level="medium")

    # 第一优先级：BACH 假设树公式裁决（置信度来自证据账本，可重放复现）
    try:
        adjudication = tianji_bach_service.adjudicate(db, card.id)
    except Exception:  # noqa: BLE001 - 裁决不可用时退回旧路径
        adjudication = None
    if adjudication:
        verdict, risk_level = VERDICT_LABELS.get(adjudication["verdict"], VERDICT_LABELS["pause"])
        return WorkbenchColdReview(
            verdict=verdict,
            confidence=int(round(adjudication["probability"] * 100)),
            reasons=[str(item) for item in adjudication["reasons"]][:3],
            risk_level=risk_level,
        )

    # 第二优先级：生成验证卡时由 LLM 给出的冷酷审判
    meta = card.meta if isinstance(card.meta, dict) else {}
    cold = meta.get("cold_review") if isinstance(meta.get("cold_review"), dict) else {}
    if cold:
        return WorkbenchColdReview(
            verdict=str(cold.get("verdict") or "暂不建议直接投入"),
            confidence=_int(cold.get("confidence"), 60),
            reasons=[str(item) for item in cold.get("reasons", []) if str(item).strip()][:3],
            risk_level=str(cold.get("risk_level") or "medium"),
        )

    # 规则回退：理由取项目风险画像，置信度按证据完成度推导
    reasons: list[str] = []
    top_risks = []
    if project and isinstance(project.risk_profile, dict):
        top_risks = project.risk_profile.get("top_risks") or []
    if isinstance(top_risks, list) and top_risks:
        reasons = [str(item.get("risk") or "") for item in top_risks if isinstance(item, dict) and item.get("risk")][:3]
    if not reasons:
        reasons = [f"「{action.title}」尚未完成" for action in actions if action.status != "done"][:3]

    target = max(1, sum(max(action.evidence_target, 1) for action in actions))
    coverage = min(1.0, evidence.existing / target)
    confidence = int(40 + coverage * 50)
    if coverage >= 0.8:
        verdict, risk_level = "可小额继续验证", "low"
    elif coverage >= 0.4:
        verdict, risk_level = "建议调整后再投入", "medium"
    else:
        verdict, risk_level = "暂不建议直接投入", "high"
    return WorkbenchColdReview(verdict=verdict, confidence=confidence, reasons=reasons, risk_level=risk_level)


def _final_decision(card: ValidationCard | None) -> str:
    if not card or not card.result:
        return "未决"
    return {
        "achieved": "继续",
        "partially_achieved": "调整",
        "not_achieved": "暂停",
    }.get(card.result, "未决")


def _next_action(card: ValidationCard | None, actions: list[WorkbenchAction]) -> str:
    if not card:
        return "输入你最需要验证的投入决策，生成7天验证卡"
    for action in actions:
        if action.status != "done":
            return f"先完成「{action.title}」，再更新7天验证卡"
    if card.status == "completed":
        return "将复盘结果沉淀为经营档案与决策病例"
    return "进入第7天复盘，判断继续、调整还是暂停"


def _case_assets(card: ValidationCard | None) -> list[WorkbenchCaseAsset]:
    done = bool(card and card.status == "completed")
    status = "ready" if done else "pending"
    return [
        WorkbenchCaseAsset(label="经营档案", status=status),
        WorkbenchCaseAsset(label="决策病例库", status=status),
        WorkbenchCaseAsset(label="方法资产", status=status),
    ]


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
