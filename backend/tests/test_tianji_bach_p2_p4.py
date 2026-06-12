"""P2 异构评审聚合 + P4 敏感性权重与蒙特卡洛沙盘。"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import TianjiEvidenceRecord, ValidationCard
from app.services import tianji_bach_service as bach
from app.services import tianji_sandbox_service as sandbox


class _StubLLM:
    available = True

    def __init__(self, response, model="stub"):
        self.response = response
        self.model = model

    def chat_json(self, *args, **kwargs):
        return self.response


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _card(db):
    card = ValidationCard(title="是否投入30万启动GEO服务产品化", tenant_id="t1", target_customer="中小企业主")
    db.add(card)
    db.flush()
    return card


def _case(db):
    card = _card(db)
    hypotheses = bach.generate_hypotheses(db, card, llm=None)
    return card, hypotheses


# ------------------------- P2 异构评审 ------------------------- #

def test_heterogeneous_review_median_and_strictest_grade():
    db = _db()
    card, hypotheses = _case(db)
    target = hypotheses[0]
    primary = _StubLLM({"hypothesis_id": target.id, "grade": "B", "log_lr": 0.6, "rationale": "主模型"}, model="deepseek")
    reviewer_a = _StubLLM({"hypothesis_id": target.id, "grade": "C", "log_lr": 0.4, "rationale": "评审A"}, model="kimi")
    reviewer_b = _StubLLM({"hypothesis_id": target.id, "grade": "B", "log_lr": 0.5, "rationale": "评审B"}, model="glm")

    record = bach.record_evidence(
        db, card, content="客户预付订金", source_type="project_evidence", source_ref="s1",
        llm=primary, reviewers=[reviewer_a, reviewer_b],
    )
    # log_lr 中位数 0.5；grade 取最严格 C（上限 0.5），截断后仍 0.5
    assert record.log_lr_raw == 0.5
    assert record.grade == "C"
    assert record.log_lr_effective == 0.5
    assert record.reviewer_spread == 0.2
    reviewers = record.review_detail["reviewers"]
    assert len(reviewers) == 3
    assert {item["model"] for item in reviewers} == {"deepseek", "kimi", "glm"}
    assert record.review_detail["reviewer"] == "heterogeneous"


def test_disputed_evidence_is_discounted():
    db = _db()
    card, hypotheses = _case(db)
    target = hypotheses[0]
    primary = _StubLLM({"hypothesis_id": target.id, "grade": "B", "log_lr": 0.7}, model="m1")
    reviewer = _StubLLM({"hypothesis_id": target.id, "grade": "B", "log_lr": -0.1}, model="m2")

    record = bach.record_evidence(
        db, card, content="争议证据", source_type="project_evidence", source_ref="s1",
        llm=primary, reviewers=[reviewer],
    )
    # 中位数 0.3，极差 0.8 > 0.6 → disputed，降权 50%
    assert record.reviewer_spread == 0.8
    assert record.review_detail.get("disputed") is True
    assert record.log_lr_effective == 0.15


def test_hypothesis_attribution_majority_vote():
    db = _db()
    card, hypotheses = _case(db)
    h_demand = hypotheses[0]
    h_pay = next(h for h in hypotheses if h.dimension == "willingness_to_pay")
    primary = _StubLLM({"hypothesis_id": h_demand.id, "grade": "C", "log_lr": 0.3}, model="m1")
    reviewer_a = _StubLLM({"hypothesis_id": h_pay.id, "grade": "C", "log_lr": 0.4}, model="m2")
    reviewer_b = _StubLLM({"hypothesis_id": h_pay.id, "grade": "C", "log_lr": 0.5}, model="m3")

    record = bach.record_evidence(
        db, card, content="x", source_type="project_evidence", source_ref="s1",
        llm=primary, reviewers=[reviewer_a, reviewer_b],
    )
    # 2:1 多数票归属付费意愿假设；中位数取多数派 (0.4, 0.5) → 0.45
    assert record.hypothesis_id == h_pay.id
    assert record.log_lr_raw == 0.45


def test_single_model_keeps_zero_spread():
    db = _db()
    card, hypotheses = _case(db)
    target = hypotheses[0]
    primary = _StubLLM({"hypothesis_id": target.id, "grade": "D", "log_lr": 0.1}, model="m1")
    record = bach.record_evidence(
        db, card, content="x", source_type="project_evidence", source_ref="s1", llm=primary,
    )
    assert record.reviewer_spread == 0.0
    assert record.review_detail["reviewer"] == "llm-single"


# ------------------------- P4 敏感性权重 ------------------------- #

def test_decisive_hypothesis_gets_full_weight():
    db = _db()
    card, hypotheses = _case(db)
    # 把两个 high 假设推到高置信度，使裁决落在阈值附近，单个假设翻转即可改变结论
    for h in hypotheses:
        h.current_logodds = bach.logodds(0.9 if h.impact_weight >= 0.9 else 0.6)
        db.add(h)
    db.flush()
    adjudication = bach.adjudicate(db, card.id)
    rows = {item["id"]: item for item in adjudication["hypotheses"]}
    decisive_rows = [item for item in adjudication["hypotheses"] if item["decisive"]]
    assert decisive_rows, "阈值附近必须存在决定性假设"
    for item in decisive_rows:
        assert item["impact_weight"] == 1.0
    # 结构权重保留原值，未被覆盖
    for h in hypotheses:
        assert rows[h.id]["structural_weight"] == h.impact_weight


def test_sensitivity_not_persisted_to_db():
    db = _db()
    card, hypotheses = _case(db)
    before = {h.id: h.impact_weight for h in hypotheses}
    bach.adjudicate(db, card.id)
    after = {h.id: h.impact_weight for h in bach.list_hypotheses(db, card.id)}
    assert before == after


# ------------------------- P4 蒙特卡洛沙盘 ------------------------- #

_GOOD_PARAMS = {
    "unit_price": {"min": 30000, "mode": 50000, "max": 80000},
    "monthly_new_customers": {"min": 2, "mode": 4, "max": 8},
    "cac": {"min": 3000, "mode": 5000, "max": 9000},
    "unit_delivery_cost": {"min": 5000, "mode": 8000, "max": 15000},
    "fixed_monthly_cost": {"min": 10000, "mode": 15000, "max": 25000},
}


def test_simulate_is_deterministic_and_sane():
    result_a = sandbox.simulate(_GOOD_PARAMS, investment=300000, target_months=12, seed="case-x")
    result_b = sandbox.simulate(_GOOD_PARAMS, investment=300000, target_months=12, seed="case-x")
    assert result_a == result_b  # 固定种子可复现
    assert 0.5 < result_a["p_payback"] <= 1.0  # 单客毛利为正的参数下应大概率回本
    assert result_a["payback_p50"] is not None
    assert result_a["tornado"][0]["swing"] >= result_a["tornado"][-1]["swing"]


def test_simulate_hopeless_params_low_probability():
    bad = dict(_GOOD_PARAMS, unit_price={"min": 3000, "mode": 5000, "max": 8000})
    result = sandbox.simulate(bad, investment=300000, target_months=12, seed="case-y")
    assert result["p_payback"] < 0.05
    assert result["loss_probability"] > 0.9


def test_sandbox_missing_params_does_not_fabricate():
    db = _db()
    card, _ = _case(db)
    llm = _StubLLM({"investment": 300000, "payback_target_months": 12, "params": {"unit_price": _GOOD_PARAMS["unit_price"]}})
    result = sandbox.run_sandbox(db, card, llm)
    assert result["available"] is False
    assert any("月新增客户数" in item for item in result["missing"])
    # 不可用时不得入账任何 simulation 证据
    rows = db.query(TianjiEvidenceRecord).filter_by(case_id=card.id, source_type="simulation").all()
    assert rows == []


def test_sandbox_records_unit_economics_evidence_and_meta():
    db = _db()
    card, hypotheses = _case(db)
    h_econ = next(h for h in hypotheses if h.dimension == "unit_economics")
    before = h_econ.current_logodds
    llm = _StubLLM({"investment": 300000, "payback_target_months": 12, "params": _GOOD_PARAMS})
    result = sandbox.run_sandbox(db, card, llm)
    assert result["available"] is True
    assert result["p_payback"] is not None

    rows = db.query(TianjiEvidenceRecord).filter_by(case_id=card.id, source_type="simulation").all()
    assert len(rows) == 1
    record = rows[0]
    assert record.grade == "B"
    assert abs(record.log_lr_effective) <= bach.GRADE_LOG_LR_CAP["B"]
    assert record.hypothesis_id == h_econ.id
    assert h_econ.current_logodds != before  # 沙盘结论改变单位经济假设置信度
    assert isinstance((card.meta or {}).get("sandbox"), dict)
    # 重放仍一致
    replayed = bach.replay_case(db, card.id)
    for h in bach.list_hypotheses(db, card.id):
        assert replayed[h.id] == h.current_logodds
