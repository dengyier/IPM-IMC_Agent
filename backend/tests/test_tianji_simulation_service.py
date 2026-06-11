from app.schemas.diagnosis import RoutingDecision
from app.services.context_fusion_service import FusedContext, FusedNode
from app.services.embeddings import LocalHashingEmbedding
from app.services.tianji_simulation_service import TianjiSimulationService


class DummyLLM:
    available = False


def test_tianji_simulation_fallback_builds_paths_without_leaking_core_chunks():
    context = FusedContext(
        nodes=[
            FusedNode(
                id="node-1",
                node_name="价值主张设计",
                node_category="核心方法论",
                definition="判断客户是否能感知并愿意为价值付费。",
                core_principle="从客户任务、痛点和收益出发定义价值。",
                core_thinking="先验证客户是否真有问题，再验证解决方案。",
                decision_logic=["先访谈高意向客户，再做小规模付费验证。"],
                key_questions=["客户为什么现在必须解决这个问题？"],
                applicable_scenarios=["新项目验证"],
                score=1.0,
            )
        ],
        core_chunks=[
            {
                "text": "INTERNAL COURSE SECRET SHOULD NOT LEAK",
                "section_title": "内部课件",
                "score": 0.91,
                "internal_only": True,
            }
        ],
        composite_score=0.82,
    )
    routing = RoutingDecision(
        intent="project_feasibility",
        intent_description="判断项目是否可行",
        matched_score=2,
        required_node_ids=["node-1"],
        canvas_modules=["customer_segments", "value_propositions"],
    )

    result = TianjiSimulationService(DummyLLM()).run(
        question="我想做一个面向银发族的智能用药管理盒，帮我判断是否值得做",
        project_context="项目名称：银发族智能用药管理盒\n目标客户：子女与独居老人",
        file_context="",
        history_text="",
        routing=routing,
        context=context,
        mode="chat",
    )

    payload = result.model_dump()
    assert payload["algorithm_version"] == "tianji-mps.v1"
    assert payload["decision_frame"]["decision_objective"]
    assert len(payload["decision_roles"]) >= 3
    assert len(payload["scenario_paths"]) >= 3
    assert len(payload["validation_plan"]) >= 3
    assert "价值主张设计" in str(payload["evidence_refs"])
    assert "INTERNAL COURSE SECRET" not in str(payload)


def test_tianji_simulation_uses_project_history_for_contradictions_and_assumption_status():
    context = FusedContext(
        nodes=[
            FusedNode(
                id="node-1",
                node_name="价值主张设计",
                node_category="核心方法论",
                definition="判断客户是否愿意为价值付费。",
                core_principle="价值必须由客户行为验证。",
                core_thinking="不要把口头兴趣当作付费承诺。",
                decision_logic=["先做付费承诺测试。"],
                key_questions=["客户是否愿意现在付费？"],
                applicable_scenarios=["新项目验证"],
                score=0.9,
            )
        ],
        composite_score=0.7,
    )
    routing = RoutingDecision(
        intent="project_feasibility",
        matched_score=1,
        required_node_ids=["node-1"],
    )

    result = TianjiSimulationService(DummyLLM()).run(
        question="继续判断 GEO 服务是否值得加预算",
        project_context="项目名称：GEO 服务验证",
        project_history="验证卡回填：- 验证付费承诺；状态：未达成；复盘学习：付费承诺是假设短板。",
        file_context="",
        history_text="",
        routing=routing,
        context=context,
        mode="chat",
    )

    assert result.contradictions
    assert "未达成" in result.contradictions[0]
    assert result.assumption_status
    assert result.assumption_status[0].status == "failed"
    assert "未达成" in result.assumption_status[0].evidence
    assert any(ref.type == "validation_feedback" for ref in result.evidence_refs)


class RecordingLLM:
    available = True
    model = "fake-llm"

    def __init__(self, identical_roles: bool = False) -> None:
        self.identical_roles = identical_roles
        self.calls: list[dict] = []

    def chat_json(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens=None):
        self.calls.append(
            {
                "system": system_prompt,
                "user": user_prompt,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        if "单个决策角色" in user_prompt:
            role = user_prompt.split("角色：", 1)[-1].splitlines()[0].strip()
            position = "都同意继续推进，先做客户访谈。" if self.identical_roles else f"{role} 从自身证据出发给出独立判断。"
            return {
                "role": role,
                "lens": f"{role} 的独立视角",
                "key_question": f"{role} 最关心什么？",
                "likely_position": position,
            }
        if "辩论轮次" in user_prompt:
            return {
                "round_index": 1,
                "positions": [
                    {"role": "CEO/创始人", "updated_position": "先小规模推进", "conflicts_with": ["CFO/财务负责人：预算约束"]},
                    {"role": "CFO/财务负责人", "updated_position": "先控预算验证", "conflicts_with": ["CEO/创始人：推进节奏"]},
                ],
            }
        return {
            "confidence": 0.72,
            "decision_frame": {
                "decision_objective": "判断是否加大投入",
                "business_context": "项目处于验证期",
                "target_customer": "企业客户",
                "current_problem": "付费承诺不足",
                "constraints": ["预算有限"],
                "unknown_assumptions": ["客户愿意付费"],
                "expected_output": "明确继续或暂停",
            },
            "decision_roles": [
                {"role": "CEO/创始人", "lens": "", "key_question": "", "likely_position": ""},
                {"role": "CFO/财务负责人", "lens": "", "key_question": "", "likely_position": ""},
                {"role": "目标客户", "lens": "", "key_question": "", "likely_position": ""},
                {"role": "产品负责人", "lens": "", "key_question": "", "likely_position": ""},
            ],
            "scenario_paths": [
                {"name": "推进", "path_type": "base", "description": "小步推进", "decision_implication": "先验证"},
                {"name": "暂停", "path_type": "risk", "description": "暂停", "decision_implication": "先补证据"},
                {"name": "重构", "path_type": "downside", "description": "重构", "decision_implication": "调整定位"},
            ],
            "validation_plan": [
                {"step": "步骤1", "objective": "访谈", "action": "访谈10人", "success_criteria": "6人承诺", "duration": "3天"},
                {"step": "步骤2", "objective": "付费", "action": "收定金", "success_criteria": "2人预付", "duration": "5天"},
                {"step": "步骤3", "objective": "复盘", "action": "复盘数据", "success_criteria": "形成结论", "duration": "7天"},
            ],
        }


def _simple_context() -> FusedContext:
    return FusedContext(
        nodes=[
            FusedNode(
                id="node-1",
                node_name="价值主张设计",
                node_category="核心方法论",
                definition="判断客户是否愿意为价值付费。",
                core_principle="价值必须由客户行为验证。",
                core_thinking="不要把口头兴趣当作付费承诺。",
                decision_logic=["先做付费承诺测试。"],
                key_questions=["客户是否愿意现在付费？"],
                applicable_scenarios=["新项目验证"],
                score=1.0,
            ),
            FusedNode(
                id="node-2",
                node_name="单位经济模型",
                node_category="核心方法论",
                definition="判断收入、成本与回本周期。",
                core_principle="收入要覆盖获客和交付成本。",
                core_thinking="先测算单位经济。",
                decision_logic=["测算 LTV/CAC。"],
                key_questions=["毛利是否覆盖 CAC？"],
                applicable_scenarios=["商业模式设计"],
                score=0.8,
            ),
        ],
        composite_score=0.7,
    )


def test_tianji_llm_calls_each_role_independently_and_records_focus():
    llm = RecordingLLM()
    result = TianjiSimulationService(llm, embeddings=LocalHashingEmbedding()).run(
        question="是否继续投入 GEO 服务",
        project_context="项目名称：GEO 服务",
        file_context="",
        history_text="",
        routing=RoutingDecision(intent="project_feasibility", matched_score=1),
        context=_simple_context(),
        mode="chat",
    )

    role_calls = [call for call in llm.calls if "单个决策角色" in call["user"]]
    assert len(role_calls) >= 4
    assert len(result.decision_roles) >= 4
    assert all(role.evidence_focus for role in result.decision_roles)


def test_tianji_marks_roles_degraded_when_independent_positions_are_too_similar():
    llm = RecordingLLM(identical_roles=True)
    result = TianjiSimulationService(llm, embeddings=LocalHashingEmbedding()).run(
        question="是否继续投入 GEO 服务",
        project_context="项目名称：GEO 服务",
        file_context="",
        history_text="",
        routing=RoutingDecision(intent="project_feasibility", matched_score=1),
        context=_simple_context(),
        mode="chat",
    )

    assert result.roles_degraded is True
    assert result.role_similarity_max >= 0.92


def test_diagnosis_mode_generates_debate_rounds_consensus_and_disagreements():
    result = TianjiSimulationService(DummyLLM(), embeddings=LocalHashingEmbedding()).run(
        question="是否继续投入 GEO 服务",
        project_context="项目名称：GEO 服务",
        file_context="",
        history_text="",
        routing=RoutingDecision(intent="project_feasibility", matched_score=1),
        context=_simple_context(),
        mode="diagnosis",
    )

    assert result.debate_rounds
    assert result.consensus
    assert result.disagreements
