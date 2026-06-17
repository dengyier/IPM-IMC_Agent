"""验证卡生成服务。

当前阶段优先保证“可沉淀、可追踪、可复盘”。生成逻辑优先调用 LLM
从项目、会话和助手回答中抽取最小验证计划；LLM 不可用时走可解释规则回退，
避免把验证卡变成又一份长报告。
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.db.models import AssistantConversation, AssistantMessage, Project, ValidationCard
from app.db.models.auth import AuthUser
from app.db.base import utc_now
from app.schemas.validation import ValidationActionPatch, ValidationCardCreate, ValidationReviewSubmit
from app.services import tianji_bach_service
from app.services.evidence_target import infer_evidence_target
from app.services.llm import LLMService


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


def create_card(
    db: Session,
    user: AuthUser,
    payload: ValidationCardCreate,
    llm: LLMService | None = None,
) -> ValidationCard:
    source_message = _load_source_message(db, user, payload.source_message_id)
    conversation = _load_conversation(db, user, payload.conversation_id or getattr(source_message, "conversation_id", None))
    project = _resolve_or_create_project(db, user, payload, source_message, conversation)
    source_text = _source_text(payload, source_message, project)
    node_refs = list(source_message.node_refs or []) if source_message else []
    simulation_plan = _simulation_validation_plan(source_message)

    llm_data = _generate_with_llm(llm, source_text) if source_text else None
    llm_actions = _actions_from_llm(llm_data)

    card_meta: dict = {
        "source": "assistant_message" if source_message else "manual",
        "algorithm_version": _simulation_algorithm_version(source_message),
        "generated_by": "llm" if llm_data else "rules",
    }
    cold_review = _cold_review_from_llm(llm_data)
    if cold_review:
        card_meta["cold_review"] = cold_review

    card = ValidationCard(
        tenant_id=user.tenant_id,
        user_id=user.id,
        project_id=project.id if project else payload.project_id,
        conversation_id=conversation.id if conversation else payload.conversation_id,
        source_message_id=source_message.id if source_message else payload.source_message_id,
        title=_title(payload, project, conversation, source_text),
        project_summary=_summary(source_text, project),
        core_judgment=_field(llm_data, "core_judgment") or _core_judgment(source_text),
        biggest_uncertainty=_field(llm_data, "biggest_uncertainty") or _biggest_uncertainty(source_text),
        target_customer=(
            payload.target_customer
            or getattr(project, "target_customer", "")
            or _field(llm_data, "target_customer")
            or _guess_target_customer(source_text)
        ),
        failure_reason=_field(llm_data, "failure_reason") or _failure_reason(source_text),
        actions=llm_actions or _actions_from_simulation(simulation_plan) or _actions(source_text),
        decision_criteria=_decision_criteria_from_llm(llm_data) or _decision_criteria(),
        node_refs=node_refs[:8],
        meta=card_meta,
        status="draft",
    )
    if project:
        _apply_project_facts(db, project, source_text, llm_data)
        if project.status == "idea":
            project.status = "validating"
            db.add(project)
    db.add(card)
    db.flush()
    _init_bach_case(db, card, llm)
    db.commit()
    db.refresh(card)
    return card


def _init_bach_case(db: Session, card: ValidationCard, llm: LLMService | None) -> None:
    """生成假设树 + 初始裁决预测。BACH 失败不阻塞验证卡创建。"""
    try:
        tianji_bach_service.generate_hypotheses(db, card, llm)
        adjudication = tianji_bach_service.adjudicate(db, card.id)
        if adjudication:
            tianji_bach_service.create_prediction(db, card, adjudication)
    except Exception:  # noqa: BLE001 - 推演地基不可用时验证卡仍须可建
        pass


def update_action(
    db: Session,
    card: ValidationCard,
    action_index: int,
    payload: ValidationActionPatch,
    llm: LLMService | None = None,
    reviewers: tuple[LLMService, ...] | list[LLMService] | None = None,
) -> ValidationCard:
    actions = _normalized_actions(card.actions if isinstance(card.actions, list) else [])
    if action_index < 0 or action_index >= len(actions):
        raise IndexError("验证动作不存在")
    action = dict(actions[action_index])
    now = utc_now()
    has_evidence_note = payload.evidence_note is not None and payload.evidence_note.strip()
    has_evidence_item = payload.evidence_item is not None and payload.evidence_item.text.strip()
    if has_evidence_note or has_evidence_item:
        items = list(action.get("evidence_items") or [])
        entry: dict = {"created_at": now.isoformat()}
        if has_evidence_item:
            item = payload.evidence_item  # type: ignore[union-attr]
            entry["text"] = item.text.strip()
            if item.grade:
                entry["grade"] = item.grade
            if item.source_type:
                entry["source_type"] = item.source_type
            if item.attachment_url:
                entry["attachment_url"] = item.attachment_url
            if item.attachment_name:
                entry["attachment_name"] = item.attachment_name
            evidence_text = item.text.strip()
            evidence_meta = {
                "user_grade": item.grade,
                "user_source_type": item.source_type,
                "attachment_url": item.attachment_url,
                "attachment_name": item.attachment_name,
            }
        else:
            evidence_text = payload.evidence_note.strip()  # type: ignore[union-attr]
            entry["text"] = evidence_text
            evidence_meta = {}
        items.append(entry)
        action["evidence_items"] = items
        action["evidence_count"] = len(items)
        if action.get("status") == "todo":
            action["status"] = "running"
        if _int(action.get("progress"), 0) < 90:
            action["progress"] = min(90, _int(action.get("progress"), 0) + 15)
        _ledger_evidence(db, card, evidence_text, action_index, llm, reviewers, evidence_meta)
        _record_bach_prediction(db, card)
    if payload.status is not None:
        action["status"] = payload.status
        if payload.status == "done":
            action["progress"] = payload.progress if payload.progress is not None else 100
            action["completed_at"] = (payload.completed_at or now).isoformat()
        elif payload.status == "running" and action.get("progress", 0) == 0:
            action["progress"] = 20
    if payload.progress is not None:
        action["progress"] = payload.progress
    if payload.evidence_count is not None:
        action["evidence_count"] = payload.evidence_count
    if payload.evidence_target is not None:
        action["evidence_target"] = payload.evidence_target
    if payload.owner is not None:
        action["owner"] = payload.owner
    if payload.due_at is not None:
        action["due_at"] = payload.due_at.isoformat()
    if payload.completed_at is not None:
        action["completed_at"] = payload.completed_at.isoformat()
    actions[action_index] = action
    card.actions = actions
    if card.status == "draft":
        card.status = "running"
    if actions and all(item.get("status") == "done" for item in actions):
        card.status = "completed" if card.result else "running"
        meta = dict(card.meta or {})
        meta["review_due"] = True
        meta["current_day"] = 7
        card.meta = meta
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def _ledger_evidence(
    db: Session,
    card: ValidationCard,
    note: str,
    action_index: int,
    llm: LLMService | None,
    reviewers: tuple[LLMService, ...] | list[LLMService] | None = None,
    evidence_meta: dict | None = None,
) -> None:
    """证据同步进 BACH 账本（异构评审聚合）并更新假设置信度。失败不阻塞动作更新。"""
    try:
        record = tianji_bach_service.record_evidence(
            db,
            card,
            content=note,
            source_type="project_evidence",
            source_ref=f"card:{card.id}:action:{action_index}",
            llm=llm,
            reviewers=reviewers,
        )
        clean_meta = {
            key: value
            for key, value in (evidence_meta or {}).items()
            if value is not None and str(value).strip()
        }
        if record is not None and clean_meta:
            detail = dict(record.review_detail or {})
            detail["validation_evidence"] = clean_meta
            record.review_detail = detail
            db.add(record)
    except Exception:  # noqa: BLE001
        pass


def _record_bach_prediction(db: Session, card: ValidationCard) -> None:
    """每次证据更新后留存一次公式裁决快照，用于 Day7 Brier 评分轨迹。"""
    try:
        adjudication = tianji_bach_service.adjudicate(db, card.id)
        if adjudication:
            tianji_bach_service.create_prediction(db, card, adjudication)
    except Exception:  # noqa: BLE001
        pass


def submit_review(db: Session, card: ValidationCard, payload: ValidationReviewSubmit) -> ValidationCard:
    result_map = {
        "continue": "achieved",
        "adjust": "partially_achieved",
        "pause": "not_achieved",
    }
    card.result = result_map[payload.final_decision]
    card.status = "completed"
    card.actual_outcome = payload.actual_outcome.strip() or _review_outcome_text(payload)
    card.learnings = payload.learnings.strip()
    card.validated_at = utc_now()
    meta = dict(card.meta or {})
    meta["day7_review"] = {
        "final_decision": payload.final_decision,
        "interview_count": payload.interview_count,
        "paid_intent_count": payload.paid_intent_count,
        "rejection_reasons": payload.rejection_reasons,
        "channel_quotes": payload.channel_quotes,
        "estimated_cac": payload.estimated_cac,
        "reviewed_at": card.validated_at.isoformat(),
    }
    meta["case_ready"] = True
    meta["current_day"] = 7
    card.meta = meta
    db.add(card)
    _sync_project_after_review(db, card, payload.final_decision)
    try:
        tianji_bach_service.resolve_predictions(db, card)
    except Exception:  # noqa: BLE001 - 评分闭环失败不阻塞复盘提交
        pass
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
    subject = _decision_subject(text)
    customer = _target_customer_from_text(text)
    investment = _extract_investment(text) or "下一阶段投入"
    subject_short = _clip(subject.replace("是否", "").replace("继续", ""), 12)
    contract_mode = any(key in text for key in ["合同", "条款", "谈判", "责任"])
    if contract_mode:
        return [
            _tree_node(
                "n1",
                None,
                "root",
                "",
                title="划出不可接受条款清单",
                objective="明确合作底线，避免用模糊条款承接不对等风险。",
                steps=["逐条标注证据灭失、数据使用、赔偿责任、服务承诺等高风险条款", "把条款分为必须删除、必须改写、可谈判三类"],
                success_metric="形成不少于 3 条必须修改条款，并能说明商业后果。",
                grounded_on="合作风险与责任边界假设",
                target="合同正文、附件、对方补充条款",
                baseline="当前尚未形成不可接受条款清单。",
                day_range="1-2天",
                day=1,
            ),
            _tree_node(
                "n2",
                "n1",
                "branch",
                "若发现必须删除/改写条款",
                title="准备替代条款",
                objective="把拒绝变成可谈判的商业方案。",
                steps=["为每条高风险条款写出替代表述", "准备让步条件，例如价格、范围、交付周期或责任上限"],
                success_metric="对方接受至少 70% 的核心修改，或进入下一轮实质谈判。",
                grounded_on="条款可谈判性与商业收益假设",
                target="对方决策人、法务或商务负责人",
                baseline="当前没有对替代条款的接受信号。",
                owner="项目负责人与法务",
                day_range="3-4天",
                day=3,
            ),
            _tree_node(
                "n3",
                "n1",
                "branch",
                "若对方拒绝核心修改",
                title="计算放弃成本",
                objective="判断放弃合作是否比承担条款风险更优。",
                steps=["估算已投入成本、机会成本和替代客户可能性", "准备暂停合作的内部决策依据"],
                success_metric="形成放弃、降范围或继续谈判三种成本对比。",
                grounded_on="继续谈判的机会成本可接受假设",
                target="内部决策人和替代机会清单",
                baseline="当前没有放弃合作的量化成本。",
                day_range="3-5天",
                day=4,
            ),
            _tree_node(
                "n4",
                "n2",
                "synthesis",
                "若进入实质谈判或形成替代条款",
                title="做签约前决策复盘",
                objective="判断该合作是否仍值得推进。",
                steps=["评估收益、交付成本、数据风险和品牌风险", "给出签约、改签或放弃三种决策建议"],
                success_metric="形成一页签约建议，并明确继续或暂停。",
                grounded_on="收益风险比可接受假设",
                target="决策人、项目负责人、关键交付负责人",
                baseline="当前缺少基于修改结果的最终签约判断。",
                owner="决策人",
                day_range="5-7天",
                day=6,
            ),
        ]
    geo_mode = any(key.lower() in text.lower() for key in ["geo", "生成式搜索", "ai搜索", "搜索排名", "搜索可见"])
    pain_word = "AI搜索可见度和获客" if geo_mode else f"{subject}带来的关键问题"
    commitment_word = "GEO诊断、试点或订金" if geo_mode else "预约、试用、留资或小额订金"
    economics_word = "获客、交付与毛利" if geo_mode else "获客、交付、收入与成本"
    return [
        _tree_node(
            "n1",
            None,
            "root",
            "",
            title=f"验证{subject_short}痛点",
            objective=f"确认{customer}是否真的把{pain_word}视为必须解决的问题。",
            steps=[
                f"筛选 8-10 位最接近购买者或使用者的{customer}",
                f"询问他们最近一次遇到{pain_word}的场景、损失和现有替代方案",
                "记录具体损失、现有预算、拒绝原因和下一步承诺",
            ],
            success_metric=f"至少 4 位{customer}能说出具体损失或机会成本，并主动追问解决方案。",
            grounded_on=f"{customer}存在{subject}真实痛点假设",
            target=f"8-10 位有真实业务压力的{customer}",
            baseline=f"当前只有关于{subject}的内部判断，尚无客户原话和行为证据。",
            day_range="1-2天",
            day=1,
        ),
        _tree_node(
            "n2",
            "n1",
            "evidence",
            f"若至少 4 位{customer}说出具体损失",
            title=f"测试{subject_short}承诺",
            objective=f"验证{customer}不是口头认可，而是愿意为{subject}付出可记录承诺。",
            steps=[
                f"准备一个最小可交付说明或样例，让{customer}选择是否进入下一步",
                f"要求客户完成{commitment_word}之一，而不是只表达兴趣",
                "记录转化率、拒绝理由和客户愿意接受的价格/试点边界",
            ],
            success_metric=f"至少 2 位{customer}完成{commitment_word}，或给出明确采购/试点流程。",
            grounded_on=f"{customer}愿意为{subject}付出行动或金钱承诺假设",
            target=f"第一步访谈中出现高意向的{customer}",
            baseline=f"当前没有围绕{subject}的预约、试点、订金或采购流程证据。",
            owner="增长/运营负责人",
            day_range="3-4天",
            day=3,
        ),
        _tree_node(
            "n3",
            "n1",
            "branch",
            f"若少于 4 位{customer}能说出具体损失",
            title="重切客户场景",
            objective=f"判断{subject}是否只是客户分层错误，而不是机会不存在。",
            steps=[
                f"把{customer}按行业、规模、获客压力或预算分成 3 类",
                "每类追加 3 位访谈，寻找痛点更强的细分场景",
                "记录哪一类客户的损失更具体、预算更清晰",
            ],
            success_metric="找到 1 个痛点强度明显更高的细分场景，或确认该方向应暂停。",
            grounded_on=f"{subject}的真实 ICP 可能不是泛化{customer}假设",
            target=f"3 个细分场景下的{customer}",
            baseline="当前 ICP 过宽，无法判断是需求弱还是客户选错。",
            day_range="3-5天",
            day=3,
        ),
        _tree_node(
            "n4",
            "n2",
            "synthesis",
            f"若至少 2 位{customer}完成{commitment_word}",
            title=f"测算{subject_short}闭环",
            objective=f"判断{investment}是否能被{economics_word}支撑，给出继续、调整或暂停结论。",
            steps=[
                "汇总客户访谈、承诺测试、渠道线索和交付成本",
                f"估算{subject}的客单价、CAC、交付人力和毛利空间",
                f"对照{investment}形成继续、调整或暂停的投入上限",
            ],
            success_metric=f"输出一页验证复盘，明确{investment}是继续、小额调整验证还是暂停。",
            grounded_on=f"{subject}的{economics_word}可闭环假设",
            target="访谈记录、承诺测试结果、渠道数据和成本测算",
            baseline=f"当前还没有能支撑{investment}的证据汇总与投入上限。",
            owner="决策人",
            day_range="5-7天",
            day=5,
        ),
        _tree_node(
            "n5",
            "n2",
            "branch",
            f"若只有兴趣但没有{commitment_word}",
            title="重做价值包装",
            objective=f"判断客户不承诺是{subject}价值不清、价格不对，还是交付信任不足。",
            steps=[
                "把拒绝原因分为价值、价格、信任、时机四类",
                "用一页新方案重新测试 5 位高意向客户",
                "要求客户选择愿意接受的试点范围、价格或交付条件",
            ],
            success_metric="至少 2 位客户给出可接受的试点条件，否则进入暂停或换场景。",
            grounded_on=f"{subject}当前价值包装不足假设",
            target=f"未承诺但有兴趣的{customer}",
            baseline="当前只有兴趣反馈，没有行动承诺。",
            day_range="5-6天",
            day=5,
        ),
        _tree_node(
            "n6",
            "n4",
            "synthesis",
            f"若{economics_word}可支撑{investment}",
            title="确定投入上限",
            objective=f"把{investment}拆成小额继续验证预算和停止线。",
            steps=[
                "设定下一阶段预算、人力、周期和停止指标",
                "明确哪些证据达成后才允许扩大投入",
            ],
            success_metric="形成继续验证预算、资源上限和下一轮里程碑。",
            grounded_on=f"{investment}可以分阶段投入而非一次性押注假设",
            target="下一阶段预算和资源安排",
            baseline=f"当前只有{investment}总额，没有分阶段投入规则。",
            owner="决策人",
            day_range="6-7天",
            day=6,
        ),
        _tree_node(
            "n7",
            "n4",
            "synthesis",
            f"若{economics_word}无法支撑{investment}",
            title="形成暂停方案",
            objective="避免继续投入沉没成本，明确调整或暂停条件。",
            steps=[
                "列出继续投入的最大亏损点",
                "给出暂停、重定价、换客户或缩小交付范围的选择",
            ],
            success_metric="形成暂停/调整备忘录，并明确重新启动需要补齐的证据。",
            grounded_on=f"{subject}当前不具备扩大投入条件假设",
            target="决策人和项目执行负责人",
            baseline="当前没有暂停条件和重新启动条件。",
            owner="决策人",
            day_range="6-7天",
            day=7,
        ),
    ]


def _tree_node(
    node_id: str,
    parent_id: str | None,
    node_type: str,
    branch_condition: str,
    *,
    title: str,
    objective: str,
    steps: list[str],
    success_metric: str,
    grounded_on: str,
    target: str,
    baseline: str,
    owner: str = "项目负责人",
    day_range: str = "1-7天",
    day: int = 1,
) -> dict:
    return {
        "node_id": node_id,
        "parent_id": parent_id,
        "node_type": node_type,
        "branch_condition": branch_condition,
        "title": title,
        "objective": objective,
        "steps": steps,
        "success_metric": success_metric,
        "grounded_on": grounded_on,
        "target": target,
        "baseline": baseline,
        "owner": owner,
        "day_range": day_range,
        "day": day,
        "status": "todo",
        "progress": 0,
        "evidence_count": 0,
        "evidence_target": infer_evidence_target(success_metric, target, objective),
        "evidence_items": [],
    }


def _target_customer_from_text(text: str) -> str:
    guessed = _guess_target_customer(text)
    if "中小企业主" in text:
        return "中小企业主"
    if "创业者" in text:
        return "创业者"
    if "老板" in text:
        return "企业老板"
    if guessed:
        return _clip(guessed.replace("目标客户", "").replace("是", "").strip("：:，,。 "), 24)
    return "目标客户"


def _decision_subject(text: str) -> str:
    cleaned = re.sub(r"\s+", "", text.strip())
    cleaned = re.sub(r"，?目标客户.*", "", cleaned)
    cleaned = re.sub(r"，?未来\d+天.*", "", cleaned)
    cleaned = re.sub(r"[？?。]+$", "", cleaned)
    for pattern in [
        r"是否投入[^，。；;]*?(启动|做|开发|上线|推进)([^，。；;？?]+)",
        r"要不要[^，。；;]*?(启动|做|开发|上线|推进)([^，。；;？?]+)",
        r"(启动|做|开发|上线|推进)([^，。；;？?]+)",
    ]:
        match = re.search(pattern, cleaned)
        if match:
            return _clip(match.group(2), 40)
    if "GEO" in cleaned.upper():
        return "GEO服务产品化"
    return _clip(cleaned or "当前项目", 40)


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
    for index, item in enumerate(plan):
        title = str(item.get("objective") or item.get("step") or "验证动作").strip()
        action = str(item.get("action") or "").strip()
        criteria = str(item.get("success_criteria") or "").strip()
        duration = str(item.get("duration") or "7天内").strip()
        if not title and not action:
            continue
        actions.append(
            {
                "node_id": str(item.get("node_id") or f"n{index + 1}"),
                "parent_id": item.get("parent_id") if index > 0 else None,
                "node_type": str(item.get("node_type") or ("root" if index == 0 else "evidence")),
                "branch_condition": str(item.get("branch_condition") or ""),
                "title": _clip(title or action, 40),
                "objective": title or "验证当前商业假设。",
                "steps": [action] if action else ["围绕当前推演结果设计最小验证动作。"],
                "success_metric": criteria or "形成可用于继续/调整/暂停的判断依据。",
                "grounded_on": _clip(str(item.get("grounded_on") or item.get("objective") or "当前推演中的关键假设"), 120),
                "target": _clip(str(item.get("target") or "最接近该假设的现实对象"), 120),
                "baseline": _clip(str(item.get("baseline") or "当前缺少可审计的现实证据。"), 160),
                "owner": "项目负责人",
                "day_range": duration,
                "day": min(index + 2, 7),
                "status": "todo",
                "progress": 0,
                "evidence_count": 0,
                "evidence_target": infer_evidence_target(criteria, item.get("target"), title),
            }
        )
    return actions


def _decision_criteria() -> dict:
    return {
        "continue_when": "目标客户愿意给出明确承诺，且关键成本没有明显压垮毛利或交付能力。",
        "adjust_when": "客户认可问题存在，但对价值、价格、渠道或交付方式存在集中异议。",
        "pause_when": "目标客户无法清晰描述痛点，或只表达兴趣但不愿付出时间、数据、试用或金钱。",
    }


def _normalized_actions(actions: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for index, item in enumerate(actions):
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "todo")
        if status not in {"todo", "running", "done", "blocked"}:
            status = "todo"
        evidence_items = item.get("evidence_items") if isinstance(item.get("evidence_items"), list) else []
        rows.append(
            {
                "node_id": str(item.get("node_id") or f"n{index + 1}"),
                "parent_id": item.get("parent_id"),
                "node_type": str(item.get("node_type") or ("root" if index == 0 else "action")),
                "branch_condition": str(item.get("branch_condition") or ""),
                "title": str(item.get("title") or item.get("objective") or f"验证动作 {index + 1}"),
                "objective": str(item.get("objective") or ""),
                "steps": item.get("steps") if isinstance(item.get("steps"), list) else [],
                "success_metric": str(item.get("success_metric") or item.get("success_criteria") or "形成可用于决策的证据。"),
                "grounded_on": str(item.get("grounded_on") or ""),
                "target": str(item.get("target") or ""),
                "baseline": str(item.get("baseline") or ""),
                "owner": item.get("owner") or "项目负责人",
                "day_range": str(item.get("day_range") or item.get("duration") or "1-7天"),
                "day": _int(item.get("day"), min(index + 2, 7)),
                "status": status,
                "progress": max(0, min(_int(item.get("progress"), 0), 100)),
                "evidence_count": max(len(evidence_items), max(0, _int(item.get("evidence_count"), 0))),
                "evidence_target": infer_evidence_target(
                    item.get("success_metric") or item.get("success_criteria"),
                    item.get("target"),
                    item.get("objective"),
                    explicit=item.get("evidence_target"),
                ),
                "evidence_items": evidence_items,
                "due_at": item.get("due_at"),
                "completed_at": item.get("completed_at"),
            }
        )
    return rows


def _review_outcome_text(payload: ValidationReviewSubmit) -> str:
    parts = [
        f"访谈 {payload.interview_count} 人",
        f"明确付费意向 {payload.paid_intent_count} 个",
    ]
    if payload.rejection_reasons:
        parts.append(f"主要拒绝原因：{'；'.join(payload.rejection_reasons[:3])}")
    if payload.channel_quotes:
        parts.append(f"渠道报价：{'；'.join(payload.channel_quotes[:3])}")
    if payload.estimated_cac:
        parts.append(f"预估 CAC：{payload.estimated_cac}")
    return "，".join(parts)


_LLM_SYSTEM_PROMPT = """你是一位冷静的商业验证教练。用户会给出一个模糊的商业决策诉求，
你要把它拆成一个 7 天内可执行、可复盘的验证决策树。节点数量由商业问题复杂度决定，不要为了整齐而压缩。只输出 JSON，不要输出其他内容。

JSON 结构：
{
  "core_judgment": "当前阶段最关键的判断，一句话",
  "biggest_uncertainty": "最大的不确定性，一句话",
  "target_customer": "目标客户画像，没有信息时给空字符串",
  "failure_reason": "如果失败，最可能的原因，一句话",
  "planned_investment": "用户提到的计划投入金额（如 30万），没提到则 null",
  "decision_deadline": "用户提到的决策期限（YYYY-MM-DD），没提到则 null",
  "decision_tree": [
    {
      "node_id": "n1",
      "parent_id": null,
      "node_type": "root|evidence|branch|synthesis",
      "branch_condition": "从父节点进入本节点的条件；根节点为空字符串",
      "title": "动作名（尽量短，但必须表达清楚验证对象）",
      "objective": "验证什么",
      "steps": ["步骤1", "步骤2"],
      "success_metric": "可量化的成功标准",
      "grounded_on": "该动作对应的可证伪假设，如：目标客户愿意为该方案预付订金",
      "target": "现实验证对象，如：10位目标客户/3个渠道方/1个成本模型",
      "evidence_target": 10,
      "baseline": "当前基线，如：目前只有口头兴趣，没有付款或预约",
      "day_range": "如 1-3天",
      "day": 2
    }
  ],
  "decision_criteria": {
    "continue_when": "满足什么继续",
    "adjust_when": "满足什么调整",
    "pause_when": "满足什么暂停"
  },
  "cold_review": {
    "verdict": "当前是否建议直接投入的冷酷判断，如：暂不建议直接投入",
    "confidence": 0到100的整数,
    "reasons": ["理由1", "理由2", "理由3"],
    "risk_level": "low|medium|high"
  }
}

要求：
1. 不要预设固定节点数量；按关键假设、证据动作、分支路径和复盘判断深度展开，复杂项目可以超过 10 个节点；
2. 禁止只给 3 个动作；每个关键假设至少要有一个现实证据节点，重要不确定性要有正向和反向/调整分支；
3. n1 必须是 root，后续节点必须通过 parent_id 和 branch_condition 表达决策树分支；
4. 至少包含客户痛点、付费/行动承诺、渠道可达、交付/单位经济、投入上限、暂停条件、最终复盘等必要判断；如某项与项目无关，可用更贴近项目的假设替代；
5. 每个节点必须写 grounded_on、target、baseline、evidence_target；成功标准必须可量化，evidence_target 要和现实验证对象匹配，不要统一写 3；
6. 不要写泛化模板，要紧扣用户的投入金额、目标客户、决策期限和项目对象；
cold_review 基于当前没有任何验证证据这一事实给出，不要客气。"""


def _generate_with_llm(llm: LLMService | None, source_text: str) -> dict | None:
    if not llm or not llm.available:
        return None
    data = llm.chat_json(_LLM_SYSTEM_PROMPT, f"商业决策诉求：\n{_clip(source_text, 2400)}", max_tokens=5000)
    if not isinstance(data, dict) or not data.get("core_judgment"):
        return None
    return data


def _field(data: dict | None, key: str) -> str:
    if not data:
        return ""
    return _clip(str(data.get(key) or ""), 500)


def _actions_from_llm(data: dict | None) -> list[dict]:
    if not data:
        return []
    source = data.get("decision_tree")
    if not isinstance(source, list):
        source = data.get("actions")
    if not isinstance(source, list):
        return []
    actions: list[dict] = []
    for index, item in enumerate(source):
        if not isinstance(item, dict) or not item.get("title"):
            continue
        steps = item.get("steps") if isinstance(item.get("steps"), list) else []
        actions.append(
            {
                "node_id": str(item.get("node_id") or f"n{index + 1}"),
                "parent_id": item.get("parent_id") if index > 0 else None,
                "node_type": _clip(str(item.get("node_type") or ("root" if index == 0 else "evidence")), 20),
                "branch_condition": _clip(str(item.get("branch_condition") or ""), 120),
                "title": _clip(str(item["title"]), 40),
                "objective": _clip(str(item.get("objective") or ""), 200),
                "steps": [_clip(str(step), 200) for step in steps],
                "success_metric": _clip(str(item.get("success_metric") or "形成可用于决策的证据。"), 200),
                "grounded_on": _clip(str(item.get("grounded_on") or item.get("objective") or ""), 120),
                "target": _clip(str(item.get("target") or "目标客户或关键渠道方"), 120),
                "baseline": _clip(str(item.get("baseline") or "当前缺少真实行为证据。"), 160),
                "owner": "项目负责人",
                "day_range": _clip(str(item.get("day_range") or f"Day {index * 2 + 1}"), 20),
                "day": max(0, min(_int(item.get("day"), index * 2 + 2), 7)),
                "status": "todo",
                "progress": 0,
                "evidence_count": 0,
                "evidence_target": infer_evidence_target(
                    item.get("success_metric"),
                    item.get("target"),
                    item.get("objective"),
                    explicit=item.get("evidence_target"),
                ),
                "evidence_items": [],
            }
        )
    return actions if len(actions) >= 4 else []


def _decision_criteria_from_llm(data: dict | None) -> dict | None:
    if not data or not isinstance(data.get("decision_criteria"), dict):
        return None
    criteria = data["decision_criteria"]
    keys = ("continue_when", "adjust_when", "pause_when")
    if not all(str(criteria.get(key) or "").strip() for key in keys):
        return None
    return {key: _clip(str(criteria[key]), 300) for key in keys}


def _cold_review_from_llm(data: dict | None) -> dict | None:
    if not data or not isinstance(data.get("cold_review"), dict):
        return None
    cold = data["cold_review"]
    verdict = str(cold.get("verdict") or "").strip()
    if not verdict:
        return None
    risk = str(cold.get("risk_level") or "medium")
    return {
        "verdict": _clip(verdict, 40),
        "confidence": max(0, min(_int(cold.get("confidence"), 60), 100)),
        "reasons": [_clip(str(item), 60) for item in (cold.get("reasons") or []) if str(item).strip()][:3],
        "risk_level": risk if risk in {"low", "medium", "high"} else "medium",
    }


def _apply_project_facts(db: Session, project: Project, source_text: str, llm_data: dict | None) -> None:
    """把从用户输入提取的计划投入与决策期限沉淀到项目，仅在尚未设置时填充。"""
    meta = dict(project.meta or {})
    changed = False
    investment = (llm_data or {}).get("planned_investment") or _extract_investment(source_text)
    deadline = (llm_data or {}).get("decision_deadline") or _extract_deadline(source_text)
    if investment and not meta.get("planned_investment"):
        meta["planned_investment"] = _clip(str(investment), 30)
        changed = True
    if deadline and not meta.get("decision_deadline") and re.fullmatch(r"20\d{2}-\d{2}-\d{2}", str(deadline)):
        meta["decision_deadline"] = str(deadline)
        changed = True
    if changed:
        project.meta = meta
        db.add(project)


def _extract_investment(text: str) -> str | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*(亿|百万|万|千)\s*元?", text)
    if match:
        return f"{match.group(1)}{match.group(2)}"
    match = re.search(r"(\d{4,})\s*元", text)
    if match:
        return f"{match.group(1)}元"
    return None


def _extract_deadline(text: str) -> str | None:
    match = re.search(r"(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})", text)
    if not match:
        return None
    return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def _sync_project_after_review(db: Session, card: ValidationCard, decision: str) -> None:
    if not card.project_id:
        return
    project = db.get(Project, card.project_id)
    if not project:
        return
    if decision == "continue":
        project.status = "trial"
    elif decision == "adjust":
        project.status = "validating"
    elif decision == "pause":
        project.status = "paused"
    meta = dict(project.meta or {})
    meta["last_validation_decision"] = decision
    meta["last_validation_card_id"] = card.id
    meta["last_reviewed_at"] = card.validated_at.isoformat() if card.validated_at else None
    project.meta = meta
    db.add(project)


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
