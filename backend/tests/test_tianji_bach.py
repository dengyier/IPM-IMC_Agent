"""Tianji-BACH 引擎：等级截断、同源折减、重放一致性、裁决与评分闭环。"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import TianjiEvidenceRecord, ValidationCard
from app.services import tianji_bach_service as bach


class _StubLLM:
    """按队列回放 chat_json 结果的假 LLM。"""

    available = True

    def __init__(self, responses):
        self._responses = list(responses)

    def chat_json(self, *args, **kwargs):
        return self._responses.pop(0) if self._responses else None


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _card(db):
    card = ValidationCard(title="是否投入30万启动GEO服务产品化", tenant_id="t1", target_customer="中小企业主")
    db.add(card)
    db.flush()
    return card


def test_probability_logodds_roundtrip():
    for p in (0.1, 0.3, 0.5, 0.8):
        assert abs(bach.probability(bach.logodds(p)) - p) < 1e-9


def test_fallback_hypotheses_cover_required_dimensions():
    db = _db()
    card = _card(db)
    rows = bach.generate_hypotheses(db, card, llm=None)
    dimensions = {row.dimension for row in rows}
    assert {"customer_demand", "willingness_to_pay"} <= dimensions
    assert all(row.current_logodds == row.prior_logodds for row in rows)
    # 幂等：再次调用不重复建树
    assert len(bach.generate_hypotheses(db, card, llm=None)) == len(rows)


def test_fallback_hypotheses_cover_opc_partnership_dimensions():
    db = _db()
    card = ValidationCard(
        title="我准备和创享产城一同合作打造OPC社区",
        project_summary="我准备和创享产城一同合作打造OPC社区，计划投入5万。",
        tenant_id="t1",
        target_customer="OPC超级个体、中小企业主",
    )
    db.add(card)
    db.flush()

    rows = bach.generate_hypotheses(db, card, llm=None)
    dimensions = {row.dimension for row in rows}
    statements = "\n".join(row.statement for row in rows)

    assert {"partner_fit", "community_supply", "governance", "unit_economics"} <= dimensions
    assert "创享产城" in statements
    assert "OPC" in statements
    assert "治理" in statements or "收益分配" in statements


def test_grade_cap_clamps_llm_overclaim():
    db = _db()
    card = _card(db)
    hypotheses = bach.generate_hypotheses(db, card, llm=None)
    target = hypotheses[0]
    # LLM 给 D 级证据报了 0.9 的似然比，必须被截断到 0.18
    llm = _StubLLM([{"hypothesis_id": target.id, "grade": "D", "log_lr": 0.9, "rationale": "过度自信"}])
    record = bach.record_evidence(
        db, card, content="客户说想法不错", source_type="project_evidence", source_ref="s1", llm=llm
    )
    assert record.log_lr_effective == 0.18
    assert target.current_logodds == round(target.prior_logodds + 0.18, 4)


def test_same_source_decay_and_negative_full_weight():
    db = _db()
    card = _card(db)
    target = bach.generate_hypotheses(db, card, llm=None)[0]

    def stub(lr):
        return _StubLLM([{"hypothesis_id": target.id, "grade": "C", "log_lr": lr, "rationale": ""}])

    r1 = bach.record_evidence(db, card, content="e1", source_type="user_input", source_ref="客户A", llm=stub(0.5))
    r2 = bach.record_evidence(db, card, content="e2", source_type="user_input", source_ref="客户A", llm=stub(0.5))
    r3 = bach.record_evidence(db, card, content="e3", source_type="user_input", source_ref="客户A", llm=stub(-0.5))
    assert r1.log_lr_effective == 0.5
    assert r2.log_lr_effective == 0.3  # 0.5 × 0.6 同源同向折减
    assert r3.log_lr_effective == -0.5  # 反向证据全额入账


def test_replay_matches_incremental_state():
    db = _db()
    card = _card(db)
    hypotheses = bach.generate_hypotheses(db, card, llm=None)
    target = hypotheses[1]
    llm = _StubLLM(
        [
            {"hypothesis_id": target.id, "grade": "B", "log_lr": 0.65, "rationale": ""},
            {"hypothesis_id": target.id, "grade": "C", "log_lr": -0.35, "rationale": ""},
        ]
    )
    bach.record_evidence(db, card, content="订金", source_type="project_evidence", source_ref="a", llm=llm)
    bach.record_evidence(db, card, content="预算低", source_type="project_evidence", source_ref="b", llm=llm)
    replayed = bach.replay_case(db, card.id)
    for h in bach.list_hypotheses(db, card.id):
        assert abs(replayed[h.id] - h.current_logodds) < 1e-6


def test_adjudicate_thresholds_and_veto():
    db = _db()
    card = _card(db)
    hypotheses = bach.generate_hypotheses(db, card, llm=None)
    adjudication = bach.adjudicate(db, card.id)
    assert adjudication["verdict"] in {"continue", "adjust", "pause"}
    assert 0.0 <= adjudication["probability"] <= 1.0
    assert adjudication["kill_criteria"]

    # 高影响假设被 A 级反向证据打到 refuted → 一票否决
    target = next(h for h in hypotheses if h.impact_weight >= 0.95)
    llm = _StubLLM(
        [
            {"hypothesis_id": target.id, "grade": "A", "log_lr": -1.0, "rationale": "客户拒绝付款"},
            {"hypothesis_id": target.id, "grade": "A", "log_lr": -1.0, "rationale": "第二家拒绝"},
        ]
    )
    bach.record_evidence(db, card, content="拒付1", source_type="project_evidence", source_ref="x", llm=llm)
    bach.record_evidence(db, card, content="拒付2", source_type="project_evidence", source_ref="y", llm=llm)
    adjudication = bach.adjudicate(db, card.id)
    assert adjudication["verdict"] == "pause"
    assert adjudication["vetoed_by"] == target.id


def test_llm_unavailable_records_zero_effect_evidence():
    db = _db()
    card = _card(db)
    before = {h.id: h.current_logodds for h in bach.generate_hypotheses(db, card, llm=None)}
    record = bach.record_evidence(db, card, content="x", source_type="user_input", source_ref="s", llm=None)
    assert record.log_lr_effective == 0.0
    assert record.review_detail.get("reviewer") == "fallback"
    after = {h.id: h.current_logodds for h in bach.list_hypotheses(db, card.id)}
    assert before == after  # 不编造方向，置信度不动


def test_prediction_resolution_brier():
    db = _db()
    card = _card(db)
    bach.generate_hypotheses(db, card, llm=None)
    prediction = bach.create_prediction(db, card, bach.adjudicate(db, card.id))
    card.result = "not_achieved"
    bach.resolve_predictions(db, card)
    assert prediction.outcome == 0.0
    assert prediction.brier == round(prediction.probability**2, 4)
