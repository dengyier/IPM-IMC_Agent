"""天机推演资产沉淀：沉淀文本构造与来源类型推断。"""

from app.api.routers.assistant import _assistant_message_as_deposit_text
from app.api.routers.diagnosis import _report_simulation_deposit_text
from app.db.models import AssistantMessage, DiagnosisReport

_SIMULATION = {
    "archive_candidates": ["银发族药盒先验证子女付费意愿", "渠道优先做药房联营"],
    "scenario_paths": [
        {"name": "保守验证路径", "decision_implication": "先做 20 组访谈再投产品"},
    ],
    "validation_plan": [
        {"step": "子女付费意愿访谈", "success_criteria": "20 人中至少 6 人愿意预付"},
    ],
}


def test_message_deposit_text_includes_simulation_sections():
    message = AssistantMessage(
        id="m-1",
        conversation_id="c-1",
        role="assistant",
        content="建议先验证子女付费意愿。",
        tianji_simulation=_SIMULATION,
    )
    text = _assistant_message_as_deposit_text(None, message, None)
    assert "## 天机推演·可沉淀资产" in text
    assert "银发族药盒先验证子女付费意愿" in text
    assert "保守验证路径：先做 20 组访谈再投产品" in text
    assert "子女付费意愿访谈：20 人中至少 6 人愿意预付" in text


def test_message_deposit_text_without_simulation_has_no_tianji_section():
    message = AssistantMessage(
        id="m-2",
        conversation_id="c-1",
        role="assistant",
        content="普通回答。",
        tianji_simulation={},
    )
    text = _assistant_message_as_deposit_text(None, message, None)
    assert "天机推演" not in text


def test_report_simulation_deposit_text_sections():
    report = DiagnosisReport(
        id="r-1",
        title="银发族智能药盒验证",
        question="这个项目是否值得继续？",
        archive_candidates=["子女是真实付费方"],
        scenario_paths=_SIMULATION["scenario_paths"],
        tianji_risk_audit=[{"risk": "渠道成本过高", "mitigation": "先测单渠道 CAC"}],
        validation_plan=_SIMULATION["validation_plan"],
        key_assumptions=["子女愿为照护焦虑付费"],
        algorithm_version="tianji-mps.v1",
    )
    text = _report_simulation_deposit_text(report, ["子女是真实付费方"])
    assert text.startswith("# 天机推演沉淀：银发族智能药盒验证")
    assert "## 用户原始问题" in text
    assert "## 可沉淀资产" in text
    assert "## 路径结论" in text
    assert "渠道成本过高：先测单渠道 CAC" in text
    assert "## 验证计划" in text
    assert "## 关键假设" in text
    # 沉淀文本只含推演结论，不应包含核心课件原文标记
    assert "INTERNAL" not in text
