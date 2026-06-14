"""Tianji-BACH 案例快照接口契约。"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routers.assistant import _validation_card_context_for_assistant
from app.api.routers.tianji_bach import get_tianji_bach_case
from app.db.base import Base
from app.db.models import Project, TianjiEvidenceRecord, TianjiPrediction, ValidationCard
from app.db.models.auth import AuthUser
from app.schemas.validation import ValidationActionPatch, ValidationCardCreate, ValidationEvidenceItem
from app.services import tianji_bach_service as bach
from app.services import workbench_service
from app.services import validation_card_service


class _StubLLM:
    available = True

    def __init__(self, response):
        self.response = response

    def chat_json(self, *args, **kwargs):
        return self.response


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _user(db):
    user = AuthUser(id="u1", phone="13800000000", tenant_id="t1", role="member")
    db.add(user)
    db.flush()
    return user


def test_tianji_bach_case_snapshot_exposes_audit_state():
    db = _db()
    user = _user(db)
    project = Project(id="p1", tenant_id="t1", user_id="u1", name="GEO 服务产品化")
    card = ValidationCard(
        id="card1",
        tenant_id="t1",
        user_id="u1",
        project_id=project.id,
        title="是否投入30万启动GEO服务产品化",
        target_customer="中小企业主",
    )
    db.add_all([project, card])
    db.flush()

    hypotheses = bach.generate_hypotheses(db, card, llm=None)
    bach.record_evidence(
        db,
        card,
        content="客户愿意预约试用，但还没有付款",
        source_type="project_evidence",
        source_ref="card:card1:action:0",
        llm=None,
    )
    bach.create_prediction(db, card, bach.adjudicate(db, card.id))

    snapshot = get_tianji_bach_case("card1", db=db, user=user)

    assert snapshot.case_id == card.id
    assert snapshot.algorithm_version == "tianji-bach.v2"
    assert len(snapshot.hypotheses) == len(hypotheses)
    assert snapshot.adjudication is not None
    assert snapshot.evidence[0].source_type == "project_evidence"
    assert snapshot.predictions[0].verdict in {"continue", "adjust", "pause"}
    assert snapshot.replay_consistent is True


def test_assistant_context_includes_validation_card_decision_tree_and_bach():
    db = _db()
    _user(db)
    project = Project(id="p1", tenant_id="t1", user_id="u1", name="GEO 服务产品化")
    card = ValidationCard(
        id="card1",
        tenant_id="t1",
        user_id="u1",
        project_id=project.id,
        title="是否投入30万启动GEO服务产品化",
        project_summary="未来30天内决定是否继续投入30万。",
        core_judgment="建议先验证中小企业主真实痛点。",
        biggest_uncertainty="客户是否愿意为GEO服务产品化付费。",
        target_customer="中小企业主",
        failure_reason="客户觉得有意思但不愿承诺。",
        actions=[
            {
                "node_id": "n1",
                "parent_id": None,
                "node_type": "root",
                "title": "验证GEO服务产品化痛点",
                "objective": "确认中小企业主是否有AI搜索获客焦虑。",
                "success_metric": "至少4位中小企业主说出具体损失。",
                "grounded_on": "中小企业主存在GEO服务产品化真实痛点假设",
                "target": "6位中小企业主",
                "baseline": "目前只有内部判断。",
                "branch_condition": "",
                "status": "done",
                "progress": 100,
                "evidence_count": 2,
                "evidence_items": [{"text": "2位客户愿意预约试点"}],
            },
            {
                "node_id": "n2",
                "parent_id": "n1",
                "node_type": "evidence",
                "title": "测试GEO服务产品化承诺",
                "objective": "判断客户是否愿意预约试点或支付订金。",
                "success_metric": "至少2位客户完成预约。",
                "grounded_on": "客户愿意行动承诺假设",
                "target": "高意向客户",
                "baseline": "没有试点预约。",
                "branch_condition": "若 n1 达到成功标准",
                "status": "todo",
                "progress": 0,
                "evidence_count": 0,
                "evidence_items": [],
            },
        ],
        decision_criteria={
            "continue_when": "痛点与付费承诺同时成立",
            "adjust_when": "痛点成立但承诺弱",
            "pause_when": "痛点和承诺都弱",
        },
    )
    db.add_all([project, card])
    db.flush()
    bach.generate_hypotheses(db, card, llm=None)

    context, project_id = _validation_card_context_for_assistant(db, "card1", "t1")

    assert project_id == "p1"
    assert "当前7天验证任务上下文" in context
    assert "是否投入30万启动GEO服务产品化" in context
    assert "验证GEO服务产品化痛点" in context
    assert "若 n1 达到成功标准" in context
    assert "痛点与付费承诺同时成立" in context
    assert "BACH 冷酷审判" in context


def test_workbench_exposes_missing_evidence_per_decision_node():
    db = _db()
    user = _user(db)
    project = Project(id="p1", tenant_id="t1", user_id="u1", name="GEO 服务产品化")
    card = ValidationCard(
        id="card1",
        tenant_id="t1",
        user_id="u1",
        project_id=project.id,
        title="是否投入30万启动GEO服务产品化",
        actions=[
            {
                "node_id": "n1",
                "title": "验证痛点",
                "objective": "确认客户痛点",
                "success_metric": "至少3条有效证据",
                "evidence_items": [{"text": "客户A确认痛点"}],
                "status": "running",
            },
            {
                "node_id": "n2",
                "title": "测试承诺",
                "objective": "确认客户是否愿意行动",
                "success_metric": "至少3条有效证据",
                "evidence_items": [],
                "status": "todo",
            },
        ],
    )
    db.add_all([project, card])
    db.flush()

    summary = workbench_service.get_summary(db, user)

    assert [action.evidence_target for action in summary.actions] == [3, 3]
    assert [action.missing_evidence_count for action in summary.actions] == [2, 3]
    assert summary.evidence_status.existing == 1
    assert summary.evidence_status.missing == 5


def test_workbench_infers_evidence_target_from_validation_metric():
    db = _db()
    user = _user(db)
    project = Project(id="p1", tenant_id="t1", user_id="u1", name="GEO 服务产品化")
    card = ValidationCard(
        id="card1",
        tenant_id="t1",
        user_id="u1",
        project_id=project.id,
        title="是否投入30万启动GEO服务产品化",
        actions=[
            {
                "node_id": "n1",
                "title": "客户痛点访谈",
                "success_metric": "完成至少20次有效客户访谈，并收集到至少5个明确的付费信号。",
                "target": "20位中小企业主",
                "evidence_items": [{"text": "客户A确认"}],
            },
            {
                "node_id": "n2",
                "title": "渠道可达性测试",
                "success_metric": "至少一个渠道的客户获取成本低于预估客户生命周期价值。",
                "target": "1个可复用渠道",
                "evidence_items": [],
            },
            {
                "node_id": "n3",
                "title": "人工设定目标",
                "success_metric": "形成复盘备忘录。",
                "evidence_target": 6,
                "evidence_items": [{"text": "样本1"}, {"text": "样本2"}],
            },
        ],
    )
    db.add_all([project, card])
    db.flush()

    summary = workbench_service.get_summary(db, user)

    assert [action.evidence_target for action in summary.actions] == [20, 1, 6]
    assert [action.missing_evidence_count for action in summary.actions] == [19, 1, 4]
    assert summary.evidence_status.existing == 3
    assert summary.evidence_status.missing == 24


def test_validation_action_evidence_updates_bach_prediction_trace():
    db = _db()
    user = _user(db)
    card = validation_card_service.create_card(
        db,
        user,
        ValidationCardCreate(
            title="是否投入30万启动GEO服务产品化",
            project_description="计划投入30万，面向中小企业主提供GEO服务产品化。",
            target_customer="中小企业主",
        ),
        llm=None,
    )

    action = card.actions[0]
    assert action["grounded_on"]
    assert action["target"]
    assert action["baseline"]
    before = db.query(TianjiPrediction).filter(TianjiPrediction.case_id == card.id).count()

    validation_card_service.update_action(
        db,
        card,
        0,
        ValidationActionPatch(evidence_note="客户愿意预约试用，但暂时不愿支付订金"),
        llm=None,
    )

    after = db.query(TianjiPrediction).filter(TianjiPrediction.case_id == card.id).count()
    assert after == before + 1


def test_validation_action_evidence_item_metadata_flows_to_bach_ledger():
    db = _db()
    user = _user(db)
    card = validation_card_service.create_card(
        db,
        user,
        ValidationCardCreate(
            title="是否投入30万启动GEO服务产品化",
            project_description="计划投入30万，面向中小企业主提供GEO服务产品化。",
            target_customer="中小企业主",
        ),
        llm=None,
    )

    validation_card_service.update_action(
        db,
        card,
        0,
        ValidationActionPatch(
            evidence_item=ValidationEvidenceItem(
                text="客户A愿意预约试点，并要求下周看报价。",
                grade="B",
                source_type="user_interview",
                attachment_url="/uploads/evidence_attachments/card/a.png",
                attachment_name="访谈截图.png",
            )
        ),
        llm=None,
    )

    db.refresh(card)
    stored_item = card.actions[0]["evidence_items"][0]
    assert stored_item["source_type"] == "user_interview"
    assert stored_item["grade"] == "B"
    record = (
        db.query(TianjiEvidenceRecord)
        .filter(TianjiEvidenceRecord.case_id == card.id)
        .order_by(TianjiEvidenceRecord.created_at.desc())
        .first()
    )
    assert record is not None
    assert record.content == "客户A愿意预约试点，并要求下周看报价。"
    assert record.review_detail["validation_evidence"]["user_source_type"] == "user_interview"
    assert record.review_detail["validation_evidence"]["user_grade"] == "B"
    assert record.review_detail["validation_evidence"]["attachment_name"] == "访谈截图.png"


def test_validation_card_fallback_generates_decision_tree_from_decision_problem():
    db = _db()
    user = _user(db)

    card = validation_card_service.create_card(
        db,
        user,
        ValidationCardCreate(
            title="是否投入30万启动GEO服务产品化",
            project_description="是否投入30万启动GEO服务产品化，目标客户是中小企业主，未来30天内要决定是否继续投入。",
            target_customer="中小企业主",
        ),
        llm=None,
    )

    assert len(card.actions) >= 5
    titles = [action["title"] for action in card.actions]
    combined = "\n".join(
        f"{action['title']} {action['objective']} {action['success_metric']} {action['grounded_on']} {action['target']} {action['baseline']}"
        for action in card.actions
    )
    assert titles != ["访谈目标客户", "做最小承诺测试", "复盘商业假设"]
    assert "GEO" in combined
    assert "中小企业主" in combined
    assert "30万" in card.project_summary or "30万" in combined
    assert card.actions[0]["node_type"] == "root"
    assert card.actions[0]["parent_id"] is None
    assert any(action["parent_id"] == card.actions[0]["node_id"] for action in card.actions[1:])
    assert any(action["branch_condition"] for action in card.actions[1:])


def test_validation_card_llm_decision_tree_is_preferred_over_flat_actions():
    db = _db()
    user = _user(db)
    llm = _StubLLM(
        {
            "core_judgment": "先验证GEO获客痛点和付费承诺。",
            "biggest_uncertainty": "中小企业主是否愿意为GEO服务付费。",
            "target_customer": "中小企业主",
            "decision_tree": [
                {
                    "node_id": "n1",
                    "parent_id": None,
                    "node_type": "root",
                    "title": "确认GEO痛点",
                    "objective": "验证中小企业主是否有AI搜索获客焦虑。",
                    "steps": ["访谈10位中小企业主"],
                    "success_metric": "至少4人说出具体损失。",
                    "grounded_on": "GEO痛点真实存在假设",
                    "target": "10位中小企业主",
                    "baseline": "当前只有内部判断。",
                    "branch_condition": "",
                    "day_range": "1-2天",
                    "day": 1,
                },
                {
                    "node_id": "n2",
                    "parent_id": "n1",
                    "node_type": "evidence",
                    "title": "测试试点承诺",
                    "objective": "验证客户愿意进入GEO试点。",
                    "steps": ["提供诊断样例并要求预约试点"],
                    "success_metric": "至少2人预约试点。",
                    "grounded_on": "客户愿意行动承诺假设",
                    "target": "高意向客户",
                    "baseline": "没有试点预约。",
                    "branch_condition": "若 n1 达到成功标准",
                    "day_range": "3-4天",
                    "day": 3,
                },
                {
                    "node_id": "n3",
                    "parent_id": "n1",
                    "node_type": "branch",
                    "title": "重切客户场景",
                    "objective": "若痛点弱，寻找更强行业场景。",
                    "steps": ["访谈本地生活、B2B服务、教育培训三类客户"],
                    "success_metric": "找到一个痛点更强的细分场景。",
                    "grounded_on": "当前ICP可能过宽假设",
                    "target": "三个细分行业客户",
                    "baseline": "客户场景未分层。",
                    "branch_condition": "若 n1 未达到成功标准",
                    "day_range": "3-4天",
                    "day": 3,
                },
                {
                    "node_id": "n4",
                    "parent_id": "n2",
                    "node_type": "synthesis",
                    "title": "测算投入上限",
                    "objective": "判断30万投入是否可控。",
                    "steps": ["测算CAC、交付成本、毛利"],
                    "success_metric": "给出继续、调整或暂停。",
                    "grounded_on": "单位经济可闭环假设",
                    "target": "试点报价和成本数据",
                    "baseline": "没有投入上限。",
                    "branch_condition": "若 n2 达到成功标准",
                    "day_range": "5-7天",
                    "day": 6,
                },
            ],
            "actions": [{"title": "不应采用的旧动作", "objective": "旧字段"}],
            "decision_criteria": {
                "continue_when": "有试点承诺且单位经济成立",
                "adjust_when": "有痛点但承诺弱",
                "pause_when": "痛点与承诺都弱",
            },
        }
    )

    card = validation_card_service.create_card(
        db,
        user,
        ValidationCardCreate(
            title="是否投入30万启动GEO服务产品化",
            project_description="是否投入30万启动GEO服务产品化，目标客户是中小企业主。",
            target_customer="中小企业主",
        ),
        llm=llm,
    )

    assert [action["node_id"] for action in card.actions] == ["n1", "n2", "n3", "n4"]
    assert card.actions[1]["parent_id"] == "n1"
    assert card.actions[2]["branch_condition"] == "若 n1 未达到成功标准"
    assert "不应采用" not in "\n".join(action["title"] for action in card.actions)


def test_validation_card_keeps_deep_llm_decision_tree_without_truncating():
    db = _db()
    user = _user(db)
    deep_tree = [
        {
            "node_id": f"n{i}",
            "parent_id": None if i == 1 else "n1",
            "node_type": "root" if i == 1 else ("branch" if i % 3 == 0 else "evidence"),
            "title": f"验证节点{i}",
            "objective": f"验证第{i}个关键假设。",
            "steps": [f"执行第{i}个现实验证动作"],
            "success_metric": f"拿到第{i}类可审计证据。",
            "grounded_on": f"关键假设{i}",
            "target": "目标客户",
            "baseline": "当前缺少证据。",
            "branch_condition": "" if i == 1 else "若父节点结果不充分",
            "day_range": "1-7天",
            "day": min(i, 7),
        }
        for i in range(1, 13)
    ]
    llm = _StubLLM(
        {
            "core_judgment": "需要深度展开多条商业假设。",
            "biggest_uncertainty": "真实付费与渠道闭环是否成立。",
            "target_customer": "中小企业主",
            "decision_tree": deep_tree,
            "decision_criteria": {
                "continue_when": "关键假设大部分成立",
                "adjust_when": "局部成立但路径需调整",
                "pause_when": "关键假设连续证伪",
            },
        }
    )

    card = validation_card_service.create_card(
        db,
        user,
        ValidationCardCreate(
            title="是否投入30万启动GEO服务产品化",
            project_description="是否投入30万启动GEO服务产品化，目标客户是中小企业主。",
            target_customer="中小企业主",
        ),
        llm=llm,
    )

    assert len(card.actions) == 12
    assert card.actions[-1]["node_id"] == "n12"
