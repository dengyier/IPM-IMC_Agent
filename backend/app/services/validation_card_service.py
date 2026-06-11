"""验证卡生成服务。

当前阶段优先保证“可沉淀、可追踪、可复盘”。生成逻辑采用可解释规则，
从项目、会话和助手回答中抽取最小验证计划，避免把验证卡变成又一份长报告。
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.db.models import AssistantConversation, AssistantMessage, Project, ValidationCard
from app.db.models.auth import AuthUser
from app.schemas.validation import ValidationCardCreate


def _scope(user: AuthUser) -> str | None:
    return None if getattr(user, "role", None) == "super_admin" else user.tenant_id


def _owned_query(db: Session, model, user: AuthUser):
    query = db.query(model)
    tid = _scope(user)
    if tid is not None:
        query = query.filter(model.tenant_id == tid)
    return query


def get_owned_card(db: Session, card_id: str, user: AuthUser) -> ValidationCard | None:
    card = db.get(ValidationCard, card_id)
    if not card:
        return None
    tid = _scope(user)
    if tid is not None and card.tenant_id != tid:
        return None
    return card


def list_cards(
    db: Session,
    user: AuthUser,
    *,
    project_id: str | None = None,
    status: str | None = None,
) -> list[ValidationCard]:
    query = _owned_query(db, ValidationCard, user)
    if project_id:
        query = query.filter(ValidationCard.project_id == project_id)
    if status:
        query = query.filter(ValidationCard.status == status)
    return query.order_by(ValidationCard.updated_at.desc()).all()


def create_card(db: Session, user: AuthUser, payload: ValidationCardCreate) -> ValidationCard:
    source_message = _load_source_message(db, user, payload.source_message_id)
    conversation = _load_conversation(db, user, payload.conversation_id or getattr(source_message, "conversation_id", None))
    project = _resolve_or_create_project(db, user, payload, source_message, conversation)
    source_text = _source_text(payload, source_message, project)
    node_refs = list(source_message.node_refs or []) if source_message else []
    simulation_plan = _simulation_validation_plan(source_message)

    card = ValidationCard(
        tenant_id=user.tenant_id,
        user_id=user.id,
        project_id=project.id if project else payload.project_id,
        conversation_id=conversation.id if conversation else payload.conversation_id,
        source_message_id=source_message.id if source_message else payload.source_message_id,
        title=_title(payload, project, conversation, source_text),
        project_summary=_summary(source_text, project),
        core_judgment=_core_judgment(source_text),
        biggest_uncertainty=_biggest_uncertainty(source_text),
        target_customer=(payload.target_customer or getattr(project, "target_customer", "") or _guess_target_customer(source_text)),
        failure_reason=_failure_reason(source_text),
        actions=_actions_from_simulation(simulation_plan) or _actions(source_text),
        decision_criteria=_decision_criteria(),
        node_refs=node_refs[:8],
        meta={
            "source": "assistant_message" if source_message else "manual",
            "algorithm_version": _simulation_algorithm_version(source_message),
        },
        status="draft",
    )
    if project and project.status == "idea":
        project.status = "validating"
        db.add(project)
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def _load_source_message(db: Session, user: AuthUser, message_id: str | None) -> AssistantMessage | None:
    if not message_id:
        return None
    query = _owned_query(db, AssistantMessage, user).filter(AssistantMessage.id == message_id)
    return query.first()


def _load_conversation(db: Session, user: AuthUser, conversation_id: str | None) -> AssistantConversation | None:
    if not conversation_id:
        return None
    query = _owned_query(db, AssistantConversation, user).filter(AssistantConversation.id == conversation_id)
    return query.first()


def _resolve_or_create_project(
    db: Session,
    user: AuthUser,
    payload: ValidationCardCreate,
    source_message: AssistantMessage | None,
    conversation: AssistantConversation | None,
) -> Project | None:
    if payload.project_id:
        project = _owned_query(db, Project, user).filter(Project.id == payload.project_id).first()
        if project:
            return project
    text = (payload.project_description or "").strip() or (source_message.content if source_message else "")
    if not text and not conversation:
        return None
    name = payload.title or (conversation.title if conversation else "") or text
    project = Project(
        tenant_id=user.tenant_id,
        user_id=user.id,
        name=_clean_title(name),
        target_customer=payload.target_customer or "",
        current_problem=_clip(text, 500),
        task_pack="new_project",
        status="validating",
    )
    db.add(project)
    db.flush()
    return project


def _source_text(
    payload: ValidationCardCreate,
    source_message: AssistantMessage | None,
    project: Project | None,
) -> str:
    parts = [
        payload.project_description or "",
        getattr(project, "current_problem", "") or "",
        source_message.content if source_message else "",
    ]
    return "\n".join(part for part in parts if part).strip()


def _title(
    payload: ValidationCardCreate,
    project: Project | None,
    conversation: AssistantConversation | None,
    source_text: str,
) -> str:
    raw = payload.title or getattr(project, "name", None) or getattr(conversation, "title", None) or source_text
    return _clean_title(raw)


def _clean_title(text: str | None) -> str:
    s = re.sub(r"\s+", " ", (text or "").strip())
    if not s or s in {"新会话", "历史会话"}:
        return "未命名验证计划"
    return s[:36]


def _clip(text: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", text.strip())
    return s if len(s) <= max_len else f"{s[:max_len]}..."


def _summary(text: str, project: Project | None) -> str:
    if project and (project.current_problem or project.target_customer):
        return _clip(f"{project.current_problem} {project.target_customer}".strip(), 260)
    return _clip(text, 260) or "围绕当前企业诉求建立最小验证计划。"


def _core_judgment(text: str) -> str:
    lowered = text.lower()
    if any(key in lowered for key in ["合同", "条款", "谈判", "法务"]):
        return "当前关键不是继续讨论方案好坏，而是先验证合作边界、责任归属和不可接受条款。"
    if any(key in text for key in ["价值主张", "客户", "付费", "需求", "市场"]):
        return "当前最重要的是验证目标客户是否真实感知价值，并愿意用时间、数据或金钱表达承诺。"
    if any(key in text for key in ["渠道", "获客", "销售", "增长", "转化"]):
        return "当前最重要的是验证获客路径是否能稳定触达高意向客户，并形成可复用转化动作。"
    return "当前问题需要从客户需求、价值主张和执行资源三条线做最小验证，再决定是否扩大投入。"


def _biggest_uncertainty(text: str) -> str:
    if any(key in text for key in ["付费", "价格", "订阅", "收入"]):
        return "客户是否愿意为该价值持续付费，以及价格能否覆盖获客与交付成本。"
    if any(key in text for key in ["合同", "条款", "责任"]):
        return "合作条款是否会把核心风险转移给我方，并削弱后续商业收益。"
    if any(key in text for key in ["渠道", "投放", "获客"]):
        return "当前渠道带来的客户是否足够精准，且转化成本是否可控。"
    return "目标客户的真实痛点强度是否足以支撑下一阶段资源投入。"


def _guess_target_customer(text: str) -> str:
    for marker in ["目标客户", "客户", "用户", "人群"]:
        idx = text.find(marker)
        if idx >= 0:
            return _clip(text[idx : idx + 120], 120)
    return ""


def _failure_reason(text: str) -> str:
    if any(key in text for key in ["合同", "条款", "责任"]):
        return "如果无法删除或重写关键风险条款，即使短期能合作，也可能在交付、数据与赔偿责任上失控。"
    if any(key in text for key in ["付费", "价格", "订阅"]):
        return "如果客户只表达兴趣但不愿付费或做出明确承诺，商业模式会停留在伪需求阶段。"
    return "如果验证对象不够具体，只收集泛泛反馈，容易把真实风险误判为市场机会。"


def _actions(text: str) -> list[dict]:
    contract_mode = any(key in text for key in ["合同", "条款", "谈判", "责任"])
    if contract_mode:
        return [
            {
                "title": "划出不可接受条款清单",
                "objective": "明确合作底线，避免用模糊条款承接不对等风险。",
                "steps": ["逐条标注证据灭失、数据使用、赔偿责任、服务承诺等高风险条款", "把条款分为必须删除、必须改写、可谈判三类"],
                "success_metric": "形成不少于 3 条必须修改条款，并能说明商业后果。",
                "owner": "项目负责人",
                "day_range": "1-2天",
            },
            {
                "title": "准备替代条款与谈判话术",
                "objective": "把拒绝变成可谈判的商业方案。",
                "steps": ["为每条高风险条款写出替代表述", "准备让步条件，例如价格、范围、交付周期或责任上限"],
                "success_metric": "对方接受至少 70% 的核心修改，或进入下一轮实质谈判。",
                "owner": "项目负责人与法务",
                "day_range": "3-4天",
            },
            {
                "title": "做签约前决策复盘",
                "objective": "判断该合作是否仍值得推进。",
                "steps": ["评估收益、交付成本、数据风险和品牌风险", "给出签约、改签或放弃三种决策建议"],
                "success_metric": "形成一页签约建议，并明确继续或暂停。",
                "owner": "决策人",
                "day_range": "5-7天",
            },
        ]
    return [
        {
            "title": "访谈目标客户",
            "objective": "验证痛点是否真实、强烈、频繁。",
            "steps": ["筛选 5-10 位最接近目标客户的人", "围绕当前解决方案前后的行为变化提问", "记录愿意付费、愿意试用、拒绝原因"],
            "success_metric": "至少 60% 受访者承认该问题正在影响其决策或成本。",
            "owner": "项目负责人",
            "day_range": "1-3天",
        },
        {
            "title": "做最小承诺测试",
            "objective": "验证客户不是口头感兴趣，而是愿意付出行动。",
            "steps": ["设计一个低成本落地页、试用报名或预约入口", "明确客户需要留下联系方式、预约时间或小额订金", "记录转化率和拒绝理由"],
            "success_metric": "目标客户中至少 20% 完成明确承诺动作。",
            "owner": "增长/运营负责人",
            "day_range": "3-5天",
        },
        {
            "title": "复盘商业假设",
            "objective": "判断是否继续投入、调整定位或暂停。",
            "steps": ["汇总访谈、承诺测试和成本数据", "对照价值主张、渠道通路、收入来源和成本结构", "形成继续、调整或暂停的决策"],
            "success_metric": "输出一页验证复盘，并明确下一步资源投入上限。",
            "owner": "决策人",
            "day_range": "6-7天",
        },
    ]


def _simulation_validation_plan(source_message: AssistantMessage | None) -> list[dict]:
    if not source_message or not isinstance(source_message.tianji_simulation, dict):
        return []
    plan = source_message.tianji_simulation.get("validation_plan")
    if not isinstance(plan, list):
        return []
    return [item for item in plan if isinstance(item, dict)]


def _simulation_algorithm_version(source_message: AssistantMessage | None) -> str | None:
    if not source_message or not isinstance(source_message.tianji_simulation, dict):
        return None
    value = source_message.tianji_simulation.get("algorithm_version")
    return str(value) if value else None


def _actions_from_simulation(plan: list[dict]) -> list[dict]:
    actions: list[dict] = []
    for item in plan[:5]:
        title = str(item.get("objective") or item.get("step") or "验证动作").strip()
        action = str(item.get("action") or "").strip()
        criteria = str(item.get("success_criteria") or "").strip()
        duration = str(item.get("duration") or "7天内").strip()
        if not title and not action:
            continue
        actions.append(
            {
                "title": _clip(title or action, 40),
                "objective": title or "验证当前商业假设。",
                "steps": [action] if action else ["围绕当前推演结果设计最小验证动作。"],
                "success_metric": criteria or "形成可用于继续/调整/暂停的判断依据。",
                "owner": "项目负责人",
                "day_range": duration,
            }
        )
    return actions


def _decision_criteria() -> dict:
    return {
        "continue_when": "目标客户愿意给出明确承诺，且关键成本没有明显压垮毛利或交付能力。",
        "adjust_when": "客户认可问题存在，但对价值、价格、渠道或交付方式存在集中异议。",
        "pause_when": "目标客户无法清晰描述痛点，或只表达兴趣但不愿付出时间、数据、试用或金钱。",
    }
