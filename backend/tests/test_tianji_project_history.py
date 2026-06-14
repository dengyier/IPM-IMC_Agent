from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routers.validation import update_validation_card
from app.db.base import Base
from app.db.models import (
    AgentRun,
    DiagnosisReport,
    ExpansionSource,
    MethodologyEdge,
    MethodologyNode,
    Project,
    TianjiPrediction,
    ValidationCard,
)
from app.db.models.auth import AuthUser
from app.schemas.diagnosis import RoutingDecision
from app.services.context_fusion_service import ContextFusionService
from app.schemas.validation import ValidationCardUpdate, ValidationReviewSubmit
from app.services.dashboard_service import DashboardService
from app.services import decision_case_service, project_service, validation_card_service


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def _user() -> AuthUser:
    return AuthUser(id="user-1", phone="13800000000", tenant_id="tenant-1", role="member")


def test_validation_card_patch_records_validation_feedback():
    db = _session()
    user = _user()
    card = ValidationCard(
        id="card-1",
        tenant_id="tenant-1",
        user_id="user-1",
        project_id="project-1",
        title="测试验证卡",
        status="running",
    )
    db.add(card)
    db.commit()

    updated = update_validation_card(
        "card-1",
        ValidationCardUpdate(
            result="not_achieved",
            actual_outcome="客户愿意试用，但没有人愿意支付定金。",
            learnings="付费意愿低于口头兴趣，需重构价值主张。",
        ),
        db=db,
        user=user,
    )

    assert updated.result == "not_achieved"
    assert updated.actual_outcome == "客户愿意试用，但没有人愿意支付定金。"
    assert updated.learnings == "付费意愿低于口头兴趣，需重构价值主张。"
    assert updated.validated_at is not None


def test_history_context_summarizes_recent_reports_and_failed_validation_cards():
    db = _session()
    project = Project(
        id="project-1",
        tenant_id="tenant-1",
        user_id="user-1",
        name="GEO 服务验证",
        target_customer="品牌方市场部",
        current_problem="验证 GEO 是否能成为稳定预算项",
    )
    db.add(project)
    db.add_all(
        [
            DiagnosisReport(
                id="report-1",
                tenant_id="tenant-1",
                project_id="project-1",
                title="第一次诊断",
                executive_summary={"one_sentence_judgement": "GEO 有机会，但必须先证明稳定收录。"},
                key_assumptions=["客户愿意为稳定信息源付费", "内容源可控"],
                final_recommendation={"decision": "小规模验证"},
            ),
            DiagnosisReport(
                id="report-2",
                tenant_id="tenant-1",
                project_id="project-1",
                title="第二次诊断",
                executive_summary={"one_sentence_judgement": "API 接入价值高于人工发稿。"},
                key_assumptions=["上游供应商有 SLA", "客户接受按效果续费"],
                final_recommendation={"decision": "转向 API 上游评估"},
            ),
        ]
    )
    db.add(
        ValidationCard(
            id="card-1",
            tenant_id="tenant-1",
            user_id="user-1",
            project_id="project-1",
            title="验证付费承诺",
            result="not_achieved",
            actual_outcome="3 个客户都只愿意试用，不愿意支付定金。",
            learnings="付费承诺是假设短板。",
            status="completed",
        )
    )
    db.commit()

    context = project_service.history_context(db, "project-1")

    assert "GEO 有机会" in context
    assert "API 接入价值高于人工发稿" in context
    assert "客户愿意为稳定信息源付费" in context
    assert "未达成" in context
    assert "付费承诺是假设短板" in context
    assert len(context) <= 1800


def test_day7_review_resolves_predictions_and_exposes_decision_case():
    db = _session()
    user = _user()
    db.add(user)
    project = Project(
        id="project-1",
        tenant_id="tenant-1",
        user_id="user-1",
        name="GEO 服务验证",
        status="validating",
        meta={"planned_investment": "30万"},
    )
    card = ValidationCard(
        id="card-1",
        tenant_id="tenant-1",
        user_id="user-1",
        project_id="project-1",
        title="验证付费承诺",
        biggest_uncertainty="客户是否愿意支付订金。",
        failure_reason="客户只有兴趣但不愿承诺。",
        status="running",
    )
    prediction = TianjiPrediction(
        tenant_id="tenant-1",
        case_id="card-1",
        verdict="adjust",
        probability=0.42,
        probability_raw=0.42,
        kill_criteria=[],
    )
    db.add_all([project, card, prediction])
    db.commit()

    updated = validation_card_service.submit_review(
        db,
        card,
        ValidationReviewSubmit(
            final_decision="pause",
            interview_count=8,
            paid_intent_count=0,
            rejection_reasons=["没有预算", "不是当前优先级"],
            actual_outcome="8 位客户都只愿意了解，没有人愿意支付订金。",
            learnings="口头兴趣不能替代付费承诺。",
        ),
    )

    db.refresh(project)
    db.refresh(prediction)
    assert updated.status == "completed"
    assert updated.result == "not_achieved"
    assert project.status == "paused"
    assert project.meta["last_validation_decision"] == "pause"
    assert prediction.outcome == 0.0
    assert prediction.brier == round(0.42**2, 4)

    cases = decision_case_service.list_cases(db, user)
    assert len(cases) == 1
    assert cases[0].validation_card_id == "card-1"
    assert cases[0].decision == "暂停"
    assert cases[0].saved_investment_estimate == "30万"
    assert "没有预算" in cases[0].failure_patterns


class DummyEmbeddings:
    def embed_text(self, text: str) -> list[float]:
        return [1.0, 0.0]


class DummyVectorStore:
    def search(self, *args, **kwargs) -> list:
        return []


def test_context_fusion_expands_one_hop_graph_nodes_with_discounted_score():
    db = _session()
    db.add_all(
        [
            MethodologyNode(
                id="node-a",
                node_name="价值主张设计",
                node_category="核心方法论",
                definition="定义价值",
                core_principle="先验证客户价值",
                core_thinking="客户任务优先",
                decision_logic=["先客户后方案"],
                key_questions=["客户为什么现在买？"],
                applicable_scenarios=["新项目验证"],
                status="active",
            ),
            MethodologyNode(
                id="node-b",
                node_name="收入模型",
                node_category="核心方法论",
                definition="设计收入",
                core_principle="收入要覆盖成本",
                core_thinking="先看单位经济",
                decision_logic=["测算 LTV/CAC"],
                key_questions=["客户是否持续付费？"],
                applicable_scenarios=["商业模式设计"],
                status="active",
            ),
        ]
    )
    db.add(
        MethodologyEdge(
            source_node_id="node-a",
            target_node_id="node-b",
            relation_type="supports",
            weight=0.9,
        )
    )
    db.commit()

    context = ContextFusionService(db, DummyEmbeddings(), DummyVectorStore()).fuse(
        "帮我判断项目是否可行",
        RoutingDecision(intent="project_feasibility", matched_score=1, required_node_ids=["node-a"]),
    )

    expanded = [node for node in context.nodes if node.id == "node-b"]
    assert len(expanded) == 1
    assert expanded[0].source == "graph_expanded"
    assert expanded[0].score < 1.0
    assert context.graph_expanded_count == 1


def test_dashboard_tianji_metrics_aggregate_algorithm_user_and_deposit_signals():
    db = _session()
    db.add_all(
        [
            Project(id="project-1", tenant_id="tenant-1", user_id="user-1", name="项目一"),
            DiagnosisReport(
                id="report-1",
                tenant_id="tenant-1",
                project_id="project-1",
                title="报告一",
                methodology_node_ids=["node-a", "node-b"],
                scenario_paths=[{"name": "路径一"}, {"name": "路径二"}],
                decision_roles=[{"role": "CEO"}, {"role": "CFO"}],
                used_llm=True,
            ),
            DiagnosisReport(
                id="report-2",
                tenant_id="tenant-1",
                project_id="project-1",
                title="报告二",
                methodology_node_ids=["node-a"],
                scenario_paths=[{"name": "路径一"}],
                decision_roles=[{"role": "CEO"}],
                used_llm=False,
            ),
            ValidationCard(
                id="card-1",
                tenant_id="tenant-1",
                user_id="user-1",
                project_id="project-1",
                title="验证卡一",
                result="achieved",
            ),
            ExpansionSource(
                id="source-1",
                tenant_id="tenant-1",
                title="推演沉淀",
                source_type="tianji_simulation",
                status="absorbed",
            ),
            AgentRun(
                id="run-1",
                tenant_id="tenant-1",
                graph_name="business_canvas_diagnosis",
                output={
                    "metrics": {
                        "node_refs": 2,
                        "graph_expanded": 1,
                        "paths": 2,
                        "roles": 4,
                        "used_llm": True,
                        "roles_degraded": False,
                    }
                },
                status="succeeded",
            ),
        ]
    )
    db.commit()

    metrics = DashboardService(db, "tenant-1").tianji_metrics(days=30)

    assert metrics.reports == 2
    assert metrics.validation_card_count == 1
    assert metrics.validation_feedback_rate == 1.0
    assert metrics.multi_path_coverage_rate == 0.5
    assert metrics.project_revisit_rate == 1.0
    assert metrics.tianji_deposit_count == 1
    assert metrics.avg_graph_expanded_nodes == 1.0


def test_project_risk_profile_updates_from_tianji_risk_audit():
    db = _session()
    project = Project(id="project-1", tenant_id="tenant-1", user_id="user-1", name="项目一")
    db.add(project)
    db.commit()

    project_service.update_risk_profile(
        db,
        "project-1",
        [
            {"risk": "单位经济未闭环", "severity": "high", "probability": "medium", "mitigation": "先测算 LTV/CAC"},
            {"risk": "差异化不足", "severity": "medium", "probability": "medium", "mitigation": "强化场景壁垒"},
        ],
    )
    db.refresh(project)

    assert project.risk_profile["top_risks"][0]["risk"] == "单位经济未闭环"
    assert project.risk_profile["risk_count"] == 2
