"""天机推演算法 v1。

v1 是一个轻量的“商业决策推演编排器”：复用现有问题路由、RAG 融合、
DeepSeek 结构化生成与本地兜底，不引入独立多智能体运行时。
"""

from __future__ import annotations

import re
import math
from typing import Any

from app.schemas.diagnosis import RoutingDecision
from app.schemas.tianji import (
    TianjiCausalChain,
    TianjiDecisionFrame,
    TianjiDecisionRole,
    TianjiDebatePosition,
    TianjiDebateRound,
    TianjiEvidenceRef,
    TianjiRiskAuditItem,
    TianjiScenarioPath,
    TianjiSimulationResult,
    TianjiAssumptionStatus,
    TianjiValidationStep,
)
from app.services.context_fusion_service import FusedContext
from app.services.embeddings import EmbeddingProvider, LocalHashingEmbedding
from app.services.llm import LLMService


ROLE_POOL: dict[str, tuple[str, str]] = {
    "CEO/创始人": ("判断这件事是否值得投入组织资源。", "只接受能证明战略必要性的验证。"),
    "CFO/财务负责人": ("判断收入、成本、现金流和回本周期。", "优先质疑单位经济和资金消耗。"),
    "目标客户": ("判断痛点是否真实、强烈、愿意付费。", "只为明确收益或风险降低买单。"),
    "渠道伙伴": ("判断是否容易触达、转化和交付。", "关注合作激励、转化率和售后责任。"),
    "竞争对手": ("判断进入壁垒和可复制性。", "会复制浅层功能，避开你的重资产试错。"),
    "运营负责人": ("判断关键活动是否可标准化。", "担心交付复杂度、人效和质量波动。"),
    "增长负责人": ("判断获客路径、话术和转化效率。", "关注首个可复用渠道而非全渠道铺开。"),
    "法务/合规": ("判断数据、合同、责任边界和监管风险。", "要求先划清不可触碰的底线。"),
    "产品负责人": ("判断方案是否真的解决客户任务。", "要求先做最小可用验证而非堆功能。"),
    "港大方法论审计员": ("判断逻辑是否符合 IMC&IPM 方法论。", "会追问客户、价值、渠道、收入是否闭环。"),
}

ROLE_EVIDENCE_FOCUS: dict[str, list[str]] = {
    "CEO/创始人": ["战略必要性", "资源投入", "增长路径", "组织承诺"],
    "CFO/财务负责人": ["单位经济", "成本结构", "现金流", "回本周期", "毛利"],
    "目标客户": ["痛点强度", "付费意愿", "替代方案", "使用场景"],
    "渠道伙伴": ["触达效率", "转化率", "合作激励", "售后责任"],
    "竞争对手": ["差异化", "进入壁垒", "可复制性", "价格敏感"],
    "运营负责人": ["交付复杂度", "标准化", "人效", "质量波动"],
    "增长负责人": ["获客渠道", "转化话术", "CAC", "首个可复用渠道"],
    "法务/合规": ["合同责任", "数据合规", "监管风险", "边界条件"],
    "产品负责人": ["客户任务", "最小可用验证", "功能取舍", "体验闭环"],
    "港大方法论审计员": ["客户价值闭环", "画布一致性", "关键假设", "验证动作"],
}

INTENT_ROLE_MAP: dict[str, list[str]] = {
    "project_feasibility": ["CEO/创始人", "目标客户", "CFO/财务负责人", "产品负责人", "港大方法论审计员"],
    "business_model_design": ["CEO/创始人", "目标客户", "渠道伙伴", "运营负责人", "港大方法论审计员"],
    "customer_definition": ["目标客户", "增长负责人", "产品负责人", "CEO/创始人", "港大方法论审计员"],
    "value_proposition_check": ["目标客户", "产品负责人", "竞争对手", "增长负责人", "港大方法论审计员"],
    "revenue_model_check": ["CFO/财务负责人", "目标客户", "渠道伙伴", "CEO/创始人", "港大方法论审计员"],
    "risk_diagnosis": ["法务/合规", "CFO/财务负责人", "运营负责人", "竞争对手", "港大方法论审计员"],
    "go_to_market": ["增长负责人", "渠道伙伴", "目标客户", "竞争对手", "港大方法论审计员"],
    "brand_positioning": ["目标客户", "增长负责人", "竞争对手", "CEO/创始人", "港大方法论审计员"],
    "organization_execution": ["运营负责人", "CEO/创始人", "CFO/财务负责人", "产品负责人", "港大方法论审计员"],
    "investment_decision": ["CEO/创始人", "CFO/财务负责人", "竞争对手", "目标客户", "港大方法论审计员"],
}


class TianjiSimulationService:
    def __init__(
        self,
        llm: LLMService | None = None,
        embeddings: EmbeddingProvider | None = None,
    ) -> None:
        self.llm = llm
        self.embeddings = embeddings or LocalHashingEmbedding()

    def run(
        self,
        *,
        question: str,
        routing: RoutingDecision,
        context: FusedContext,
        mode: str = "chat",
        project_context: str | None = None,
        file_context: str | None = None,
        history_text: str | None = None,
        project_history: str | None = None,
        canvas: dict[str, str] | None = None,
    ) -> TianjiSimulationResult:
        llm_result = self._llm_simulate(
            question=question,
            routing=routing,
            context=context,
            mode=mode,
            project_context=project_context,
            file_context=file_context,
            history_text=history_text,
            project_history=project_history,
            canvas=canvas,
        )
        if llm_result:
            return llm_result
        return self._fallback_simulate(
            question=question,
            routing=routing,
            context=context,
            mode=mode,
            project_context=project_context,
            file_context=file_context,
            history_text=history_text,
            project_history=project_history,
            canvas=canvas,
        )

    # ------------------------------------------------------------------ #
    # LLM 推演
    # ------------------------------------------------------------------ #

    def _llm_simulate(
        self,
        *,
        question: str,
        routing: RoutingDecision,
        context: FusedContext,
        mode: str,
        project_context: str | None,
        file_context: str | None,
        history_text: str | None,
        project_history: str | None,
        canvas: dict[str, str] | None,
    ) -> TianjiSimulationResult | None:
        if not self.llm or not self.llm.available:
            return None

        evidence = self._safe_evidence_refs(context, project_history)
        node_payload = [
            {
                "node": ref.ref,
                "type": ref.type,
                "summary": ref.summary,
                "score": ref.score,
            }
            for ref in evidence[:10]
        ]
        role_names = self._role_names(routing.intent)
        prompt = (
            "你是天机AI商业决策智能体的推演引擎。请基于用户诉求、项目上下文、"
            "港大 IMC&IPM 消化后的知识节点和已审核案例，做多路径商业决策推演。\n"
            "硬性要求：不要泄露内部课件原文；所有字段值都是可展示给用户的中文自然语言；"
            "不要输出 Markdown；只返回 JSON 对象。\n\n"
            f"模式：{mode}\n"
            f"用户当前问题：{question}\n"
            f"项目上下文：{project_context or '（无）'}\n"
            f"同项目历史判断与验证反馈：{project_history or '（无）'}\n"
            f"前序对话：{history_text or '（无）'}\n"
            f"附件片段摘要：{_clip(file_context or '', 2000) or '（无）'}\n"
            f"画布输入：{canvas or {}}\n"
            f"系统识别意图：{routing.intent} / {routing.intent_description or ''}\n"
            f"建议使用决策角色：{role_names}\n"
            f"可引用证据：{node_payload}\n\n"
            "返回 JSON schema：\n"
            "{\n"
            '  "confidence": 0.0,\n'
            '  "decision_frame": {"decision_objective":"","business_context":"","target_customer":"","current_problem":"","constraints":[],"unknown_assumptions":[],"expected_output":""},\n'
            '  "decision_roles": [{"role":"","lens":"","key_question":"","likely_position":""}],\n'
            '  "scenario_paths": [{"name":"","path_type":"","description":"","triggers":[],"leading_indicators":[],"decision_implication":"","probability":"high/medium/low"}],\n'
            '  "causal_chains": [{"chain":"","explanation":"","affected_modules":[],"leverage_point":""}],\n'
            '  "risk_audit": [{"risk":"","severity":"high/medium/low","probability":"high/medium/low","early_signal":"","mitigation":""}],\n'
            '  "validation_plan": [{"step":"","objective":"","action":"","success_criteria":"","duration":""}],\n'
            '  "contradictions": ["与历史判断或验证反馈存在的前后矛盾"],\n'
            '  "assumption_status": [{"assumption":"","status":"validated/failed/partial/unknown","evidence":""}],\n'
            '  "archive_candidates": ["可以沉淀为知识资产的结论"],\n'
            '  "missing_information": ["仍需用户补充的信息"]\n'
            "}\n"
            "要求：scenario_paths 至少3条，validation_plan 至少3步，decision_roles 至少4个。"
        )
        data = self.llm.chat_json(
            "只输出符合要求的 JSON，不解释。",
            prompt,
            temperature=0.35,
            max_tokens=12000,
        )
        if not isinstance(data, dict):
            return None
        try:
            result = self._normalize_result(data, mode, evidence, used_llm=True)
            independent_roles = self._llm_independent_roles(
                role_names=role_names,
                question=question,
                routing=routing,
                evidence=evidence,
                project_context=project_context,
                project_history=project_history,
            )
            if len(independent_roles) >= 3:
                result.decision_roles = independent_roles
            self._audit_role_independence(result)
            self._attach_debate_if_needed(result, routing, context, mode)
            return result
        except Exception:  # noqa: BLE001 - LLM JSON 形状不稳定时回退到确定性推演
            return None

    # ------------------------------------------------------------------ #
    # 本地兜底
    # ------------------------------------------------------------------ #

    def _fallback_simulate(
        self,
        *,
        question: str,
        routing: RoutingDecision,
        context: FusedContext,
        mode: str,
        project_context: str | None,
        file_context: str | None,
        history_text: str | None,
        project_history: str | None,
        canvas: dict[str, str] | None,
    ) -> TianjiSimulationResult:
        evidence = self._safe_evidence_refs(context, project_history)
        role_names = self._role_names(routing.intent)
        roles = [
            TianjiDecisionRole(
                role=name,
                lens=ROLE_POOL[name][0],
                key_question=self._role_question(name, routing.intent, context),
                likely_position=ROLE_POOL[name][1],
                evidence_focus=self._role_evidence_focus(name),
            )
            for name in role_names
        ]
        objective = _first_sentence(question) or "判断该企业问题的最优决策路径"
        canvas_text = "；".join(v for v in (canvas or {}).values() if v)
        business_context = _clip(project_context or canvas_text or history_text or project_history or "", 500)
        node_names = "、".join(ref.ref for ref in evidence[:4]) or "港大 IMC&IPM 核心方法论"
        frame = TianjiDecisionFrame(
            decision_objective=objective,
            business_context=business_context or "用户尚未提供完整企业背景，需要先补齐场景、客户、资源和约束。",
            target_customer=_extract_line(project_context, "目标客户") or "需要继续澄清目标客户、购买者和使用者。",
            current_problem=_extract_line(project_context, "当前核心问题") or objective,
            constraints=self._constraints(question, file_context, canvas),
            unknown_assumptions=self._unknown_assumptions(routing, context),
            expected_output="形成可执行的商业判断、风险审计和最小验证计划。",
        )
        result = TianjiSimulationResult(
            mode=mode,
            confidence=round(min(0.58 + len(evidence) * 0.035, 0.82), 2),
            decision_frame=frame,
            evidence_refs=evidence,
            decision_roles=roles,
            scenario_paths=self._scenario_paths(routing.intent, question, node_names),
            causal_chains=self._causal_chains(routing, context),
            risk_audit=self._risk_audit(routing, context),
            validation_plan=self._validation_plan(routing, context),
            contradictions=self._contradictions(project_history),
            assumption_status=self._assumption_status(routing, context, project_history),
            archive_candidates=self._archive_candidates(question, context),
            missing_information=self._missing_information(routing, canvas),
            used_llm=False,
        )
        self._audit_role_independence(result)
        self._attach_debate_if_needed(result, routing, context, mode)
        return result

    # ------------------------------------------------------------------ #
    # Builders
    # ------------------------------------------------------------------ #

    def _normalize_result(
        self,
        data: dict[str, Any],
        mode: str,
        evidence: list[TianjiEvidenceRef],
        used_llm: bool,
    ) -> TianjiSimulationResult:
        fallback = self._fallback_simulate(
            question=str(data.get("decision_frame", {}).get("decision_objective") or ""),
            routing=RoutingDecision(intent="business_model_design", matched_score=0),
            context=FusedContext(),
            mode=mode,
            project_context=None,
            file_context=None,
            history_text=None,
            project_history=None,
            canvas=None,
        )
        result = TianjiSimulationResult(
            mode=mode,
            confidence=_float(data.get("confidence"), fallback.confidence),
            decision_frame=TianjiDecisionFrame(**_dict(data.get("decision_frame"))),
            evidence_refs=evidence,
            decision_roles=[
                TianjiDecisionRole(
                    **{
                        **item,
                        "evidence_focus": item.get("evidence_focus")
                        or self._role_evidence_focus(str(item.get("role") or "")),
                    }
                )
                for item in _dict_list(data.get("decision_roles"))
            ][:8],
            scenario_paths=[
                TianjiScenarioPath(**item) for item in _dict_list(data.get("scenario_paths"))
            ][:6],
            causal_chains=[
                TianjiCausalChain(**item) for item in _dict_list(data.get("causal_chains"))
            ][:8],
            risk_audit=[
                TianjiRiskAuditItem(**item) for item in _dict_list(data.get("risk_audit"))
            ][:8],
            validation_plan=[
                TianjiValidationStep(**item) for item in _dict_list(data.get("validation_plan"))
            ][:8],
            contradictions=_str_list(data.get("contradictions"))[:8],
            assumption_status=[
                TianjiAssumptionStatus(**item)
                for item in _dict_list(data.get("assumption_status"))
            ][:8],
            roles_degraded=bool(data.get("roles_degraded") or False),
            role_similarity_max=_float(data.get("role_similarity_max"), 0.0),
            debate_rounds=[
                TianjiDebateRound(**item)
                for item in _dict_list(data.get("debate_rounds"))
            ][:3],
            consensus=_str_list(data.get("consensus"))[:8],
            disagreements=_str_list(data.get("disagreements"))[:8],
            archive_candidates=_str_list(data.get("archive_candidates"))[:8],
            missing_information=_str_list(data.get("missing_information"))[:8],
            used_llm=used_llm,
        )
        if len(result.decision_roles) < 3:
            result.decision_roles = fallback.decision_roles
        if len(result.scenario_paths) < 3:
            result.scenario_paths = fallback.scenario_paths
        if len(result.validation_plan) < 3:
            result.validation_plan = fallback.validation_plan
        if not result.assumption_status:
            result.assumption_status = fallback.assumption_status
        if not result.decision_frame.decision_objective:
            result.decision_frame = fallback.decision_frame
        self._audit_role_independence(result)
        return result

    def _safe_evidence_refs(
        self,
        context: FusedContext,
        project_history: str | None = None,
    ) -> list[TianjiEvidenceRef]:
        refs: list[TianjiEvidenceRef] = []
        for node in context.nodes[:10]:
            refs.append(
                TianjiEvidenceRef(
                    type=node.source if node.source == "graph_expanded" else "methodology_node",
                    ref=node.node_name,
                    node_id=node.id,
                    summary=_clip(node.core_principle or node.definition or node.core_thinking, 180),
                    score=node.score,
                )
            )
        for exp in (context.approved_expansions + context.cases)[:6]:
            refs.append(
                TianjiEvidenceRef(
                    type=exp.extension_type or "approved_expansion",
                    ref=exp.title,
                    node_id=exp.aligned_node_id,
                    summary=_clip(exp.summary, 180),
                    score=exp.score,
                )
            )
        if project_history:
            if "最近诊断判断" in project_history:
                refs.append(
                    TianjiEvidenceRef(
                        type="history_report",
                        ref="同项目历史诊断",
                        summary=_clip(project_history, 180),
                        score=None,
                    )
                )
            if "验证卡回填" in project_history:
                refs.append(
                    TianjiEvidenceRef(
                        type="validation_feedback",
                        ref="同项目验证卡回填",
                        summary=_clip(project_history, 180),
                        score=None,
                    )
                )
        if context.core_chunks:
            refs.append(
                TianjiEvidenceRef(
                    type="internal_methodology_context",
                    ref="内部课件切块已参与推理",
                    summary=f"已使用 {len(context.core_chunks)} 个内部方法论片段，仅用于推理，不展示原文。",
                    score=None,
                )
            )
        return refs

    def _role_names(self, intent: str) -> list[str]:
        names = INTENT_ROLE_MAP.get(intent) or INTENT_ROLE_MAP["business_model_design"]
        return list(dict.fromkeys(names + ["港大方法论审计员"]))[:6]

    def _role_evidence_focus(self, role: str) -> list[str]:
        return ROLE_EVIDENCE_FOCUS.get(role, ["客户价值", "商业闭环", "关键风险"])

    def _llm_independent_roles(
        self,
        *,
        role_names: list[str],
        question: str,
        routing: RoutingDecision,
        evidence: list[TianjiEvidenceRef],
        project_context: str | None,
        project_history: str | None,
    ) -> list[TianjiDecisionRole]:
        if not self.llm or not self.llm.available:
            return []
        roles: list[TianjiDecisionRole] = []
        for role in role_names[:6]:
            focus = self._role_evidence_focus(role)
            focused_evidence = self._focused_evidence(evidence, focus)
            prompt = (
                "你是天机AI推演引擎中的单个决策角色。请只站在该角色立场，"
                "基于分配给你的证据子集输出独立判断，不要迎合其他角色。\n"
                f"角色：{role}\n"
                f"证据焦点：{focus}\n"
                f"用户问题：{question}\n"
                f"项目上下文：{project_context or '（无）'}\n"
                f"同项目历史：{project_history or '（无）'}\n"
                f"系统意图：{routing.intent}\n"
                f"证据子集：{focused_evidence}\n"
                "返回 JSON：{\"role\":\"\",\"lens\":\"\",\"key_question\":\"\",\"likely_position\":\"\"}"
            )
            data = self.llm.chat_json(
                "只输出单个决策角色 JSON，不解释。",
                prompt,
                temperature=0.45,
                max_tokens=1200,
            )
            if not isinstance(data, dict):
                roles.append(self._fallback_role(role, routing.intent, FusedContext()))
                continue
            try:
                roles.append(
                    TianjiDecisionRole(
                        role=str(data.get("role") or role),
                        lens=str(data.get("lens") or ROLE_POOL.get(role, ("", ""))[0]),
                        key_question=str(
                            data.get("key_question")
                            or f"从{role}角度看，最先验证的假设是什么？"
                        ),
                        likely_position=str(data.get("likely_position") or ROLE_POOL.get(role, ("", ""))[1]),
                        evidence_focus=focus,
                    )
                )
            except Exception:  # noqa: BLE001
                roles.append(self._fallback_role(role, routing.intent, FusedContext()))
        return roles

    def _fallback_role(self, role: str, intent: str, context: FusedContext) -> TianjiDecisionRole:
        lens, position = ROLE_POOL.get(role, ("判断商业闭环是否成立。", "要求先做最小验证。"))
        return TianjiDecisionRole(
            role=role,
            lens=lens,
            key_question=self._role_question(role, intent, context),
            likely_position=position,
            evidence_focus=self._role_evidence_focus(role),
        )

    def _focused_evidence(
        self,
        evidence: list[TianjiEvidenceRef],
        focus: list[str],
    ) -> list[dict[str, Any]]:
        focus_text = " ".join(focus)
        scored: list[tuple[int, TianjiEvidenceRef]] = []
        for ref in evidence:
            text = f"{ref.ref} {ref.summary}"
            score = sum(1 for keyword in focus if keyword and keyword in text)
            if not score and any(token in focus_text for token in ["成本", "现金流", "单位经济"]):
                score = sum(1 for keyword in ["成本", "收入", "毛利", "CAC", "LTV"] if keyword in text)
            scored.append((score, ref))
        scored.sort(key=lambda item: (item[0], item[1].score or 0), reverse=True)
        return [
            {
                "type": ref.type,
                "ref": ref.ref,
                "summary": ref.summary,
                "score": ref.score,
            }
            for _, ref in scored[:5]
        ]

    def _audit_role_independence(self, result: TianjiSimulationResult) -> None:
        positions = [role.likely_position for role in result.decision_roles if role.likely_position]
        if len(positions) < 2:
            result.roles_degraded = False
            result.role_similarity_max = 0.0
            return
        vectors = self.embeddings.embed_texts(positions)
        max_similarity = 0.0
        for i in range(len(vectors)):
            for j in range(i + 1, len(vectors)):
                max_similarity = max(max_similarity, _cosine(vectors[i], vectors[j]))
        result.role_similarity_max = round(max_similarity, 4)
        result.roles_degraded = result.role_similarity_max >= 0.92

    def _role_question(self, role: str, intent: str, context: FusedContext) -> str:
        if role == "港大方法论审计员" and context.nodes:
            return context.nodes[0].key_questions[0] if context.nodes[0].key_questions else "客户、价值、渠道和收入是否形成闭环？"
        if role == "目标客户":
            return "这个问题是否痛到值得现在付费解决？"
        if role == "CFO/财务负责人":
            return "获客、交付和服务成本是否被收入覆盖？"
        if role == "渠道伙伴":
            return "合作后能否低成本带来高质量线索？"
        if role == "法务/合规":
            return "数据、合同和责任边界是否清楚？"
        return f"从{intent}角度看，最先验证的假设是什么？"

    def _attach_debate_if_needed(
        self,
        result: TianjiSimulationResult,
        routing: RoutingDecision,
        context: FusedContext,
        mode: str,
    ) -> None:
        if mode != "diagnosis" or result.debate_rounds:
            return
        round_one = self._debate_round(result.decision_roles, round_index=1)
        rounds = [round_one]
        if self._round_converged(
            [role.likely_position for role in result.decision_roles],
            [position.updated_position for position in round_one.positions],
        ):
            round_one.converged = True
        else:
            round_two = self._debate_round(
                [
                    TianjiDecisionRole(
                        role=position.role,
                        lens="读取上一轮冲突后的修正立场。",
                        key_question="哪些分歧必须先被验证？",
                        likely_position=position.updated_position,
                        evidence_focus=self._role_evidence_focus(position.role),
                    )
                    for position in round_one.positions
                ],
                round_index=2,
            )
            round_two.converged = self._round_converged(
                [position.updated_position for position in round_one.positions],
                [position.updated_position for position in round_two.positions],
            )
            rounds.append(round_two)
        result.debate_rounds = rounds
        result.consensus = self._debate_consensus(result, context)
        result.disagreements = self._debate_disagreements(result, routing)

    def _round_converged(self, previous: list[str], current: list[str]) -> bool:
        pairs = [(a, b) for a, b in zip(previous, current) if a and b]
        if not pairs:
            return False
        prev_vecs = self.embeddings.embed_texts([a for a, _ in pairs])
        cur_vecs = self.embeddings.embed_texts([b for _, b in pairs])
        return all(_cosine(a, b) > 0.95 for a, b in zip(prev_vecs, cur_vecs))

    def _debate_round(
        self,
        roles: list[TianjiDecisionRole],
        *,
        round_index: int,
    ) -> TianjiDebateRound:
        positions: list[TianjiDebatePosition] = []
        role_names = [role.role for role in roles]
        for role in roles[:6]:
            conflicts = []
            if "CFO" in role.role:
                conflicts.append("CEO/创始人：推进节奏与预算边界存在张力")
            elif "CEO" in role.role:
                conflicts.append("CFO/财务负责人：资源投入需要更强的单位经济证据")
            elif "目标客户" in role.role:
                conflicts.append("产品负责人：客户真实任务可能与方案功能优先级不一致")
            elif role_names:
                conflicts.append(f"{role_names[0]}：该角色证据焦点不同，结论需交叉验证")
            positions.append(
                TianjiDebatePosition(
                    role=role.role,
                    updated_position=(
                        f"{role.role}坚持先围绕{_join_focus(role.evidence_focus)}验证，"
                        f"当前立场是：{role.likely_position}"
                    ),
                    conflicts_with=conflicts[:2],
                )
            )
        return TianjiDebateRound(round_index=round_index, positions=positions, converged=False)

    def _debate_consensus(
        self,
        result: TianjiSimulationResult,
        context: FusedContext,
    ) -> list[str]:
        node = context.nodes[0].node_name if context.nodes else "核心方法论"
        consensus = [
            f"各角色都需要以「{node}」相关证据验证客户价值，而不是只凭主观判断推进。",
            "下一轮投入应绑定最小验证动作和明确成功标准。",
        ]
        if result.roles_degraded:
            consensus.append("角色立场相似度过高，本轮共识需谨慎看待。")
        return consensus

    def _debate_disagreements(
        self,
        result: TianjiSimulationResult,
        routing: RoutingDecision,
    ) -> list[str]:
        disagreements = [
            "战略推进速度与财务验证强度之间存在分歧。",
            "客户口头兴趣能否转化为付费承诺仍需验证。",
        ]
        if routing.intent in {"risk_diagnosis", "investment_decision"}:
            disagreements.append("风险边界与投入上限需要在决策前被量化。")
        return disagreements

    def _scenario_paths(self, intent: str, question: str, node_names: str) -> list[TianjiScenarioPath]:
        return [
            TianjiScenarioPath(
                name="正向验证路径",
                path_type="base",
                description=f"如果目标客户真实存在且能感知价值，应先用最小样本验证，再扩大投入。关键依据来自 {node_names}。",
                triggers=["高意向客户愿意访谈或试用", "首批转化成本低于预期", "客户能复述核心价值"],
                leading_indicators=["访谈需求强度", "试用转化率", "付费意愿"],
                decision_implication="进入小规模验证，控制预算，用数据决定是否进入诊断报告和规模化。",
                probability="medium",
            ),
            TianjiScenarioPath(
                name="需求误判路径",
                path_type="risk",
                description="如果用户表达的是兴趣而不是购买意愿，项目会在价值主张和收入来源处断裂。",
                triggers=["客户只说愿意试用但不愿付费", "使用者和购买者分离", "复购理由不清晰"],
                leading_indicators=["付费转化率", "购买阻力", "复购/续费意向"],
                decision_implication="暂停扩大投入，回到目标客户和价值主张重新定义。",
                probability="medium",
            ),
            TianjiScenarioPath(
                name="成本失控路径",
                path_type="downside",
                description="如果获客、交付或服务成本高于预期，模式可能在单位经济上不成立。",
                triggers=["CAC 高于客单价承载能力", "交付严重依赖人工", "服务成本随规模线性上升"],
                leading_indicators=["CAC", "毛利率", "交付周期", "人效"],
                decision_implication="先测算单位经济，重构定价、渠道或交付方式，再决定是否继续。",
                probability="medium",
            ),
            TianjiScenarioPath(
                name="差异化被复制路径",
                path_type="competitive",
                description="如果核心价值只停留在功能层，竞争对手容易复制，必须建立数据、场景或品牌壁垒。",
                triggers=["竞品功能相似", "客户无法说清选择理由", "渠道反馈价格敏感"],
                leading_indicators=["竞品替代率", "价格敏感度", "品牌记忆点"],
                decision_implication="优先寻找不可替代的场景切入点和可沉淀的数据资产。",
                probability="medium",
            ),
        ]

    def _causal_chains(self, routing: RoutingDecision, context: FusedContext) -> list[TianjiCausalChain]:
        modules = routing.canvas_modules or ["customer_segments", "value_propositions", "channels", "revenue_streams"]
        node = context.nodes[0].node_name if context.nodes else "核心方法论"
        return [
            TianjiCausalChain(
                chain="客户细分不清 → 价值主张分散 → 渠道转化下降 → 获客成本上升",
                explanation=f"依据「{node}」的判断逻辑，客户和价值若没有先闭环，后续增长动作会放大浪费。",
                affected_modules=modules[:4],
                leverage_point="先锁定首个高意向细分客户。",
            ),
            TianjiCausalChain(
                chain="价值感知不足 → 付费意愿不足 → 收入模型不稳定 → 投入回收周期拉长",
                explanation="这条链决定项目是否应该先验证需求强度，而不是先扩功能或扩渠道。",
                affected_modules=["value_propositions", "revenue_streams", "cost_structure"],
                leverage_point="用愿付费行为验证价值主张。",
            ),
            TianjiCausalChain(
                chain="关键活动未标准化 → 交付成本波动 → 客户体验不稳定 → 复购受损",
                explanation="当服务或交付过度依赖个体经验时，规模化会吞噬毛利和口碑。",
                affected_modules=["key_activities", "key_resources", "customer_relationships"],
                leverage_point="把交付动作拆成可复制流程。",
            ),
        ]

    def _risk_audit(self, routing: RoutingDecision, context: FusedContext) -> list[TianjiRiskAuditItem]:
        return [
            TianjiRiskAuditItem(
                risk="需求强度被高估",
                severity="high",
                probability="medium",
                early_signal="客户愿意聊但不愿付费或不愿推荐。",
                mitigation="先做小样本付费验证，不以口头兴趣作为立项依据。",
            ),
            TianjiRiskAuditItem(
                risk="单位经济未闭环",
                severity="high",
                probability="medium",
                early_signal="CAC、交付成本或服务成本高于毛利承载能力。",
                mitigation="先测算 LTV/CAC、毛利率和回本周期，再扩大投放。",
            ),
            TianjiRiskAuditItem(
                risk="差异化不足",
                severity="medium",
                probability="medium",
                early_signal="客户无法说清为什么选择你而不是竞品。",
                mitigation="把差异化从功能卖点推进到场景、数据、服务或品牌信任。",
            ),
            TianjiRiskAuditItem(
                risk="关键资源不可复制",
                severity="medium",
                probability="medium",
                early_signal="交付依赖少数人经验，流程无法稳定复制。",
                mitigation="沉淀 SOP、工具、数据和培训机制。",
            ),
        ]

    def _validation_plan(self, routing: RoutingDecision, context: FusedContext) -> list[TianjiValidationStep]:
        first_question = (
            context.nodes[0].key_questions[0]
            if context.nodes and context.nodes[0].key_questions
            else "目标客户是否存在强烈且未满足的需求？"
        )
        return [
            TianjiValidationStep(
                step="步骤1",
                objective="验证核心客户与问题强度",
                action=f"围绕「{first_question}」访谈 8-12 个目标客户，记录真实行为、预算和替代方案。",
                success_criteria="至少 60% 目标客户能清楚描述该问题，并愿意给出下一步承诺。",
                duration="1-3天",
            ),
            TianjiValidationStep(
                step="步骤2",
                objective="验证价值主张与付费意愿",
                action="制作最小价值表达页或方案卡，测试客户是否愿意预约、试用或支付定金。",
                success_criteria="形成可量化的转化率、付费意愿和拒绝理由。",
                duration="3-5天",
            ),
            TianjiValidationStep(
                step="步骤3",
                objective="验证获客与交付成本",
                action="选择一个最可控渠道做小额投放或定向触达，同时记录交付动作和时间成本。",
                success_criteria="得到 CAC、转化率、毛利空间和交付瓶颈的初步数据。",
                duration="5-7天",
            ),
            TianjiValidationStep(
                step="步骤4",
                objective="形成继续/暂停/重构决策",
                action="用客户强度、付费意愿、单位经济和风险信号做一次复盘，决定下一轮投入。",
                success_criteria="明确进入项目验证诊断、调整定位或暂停投入。",
                duration="第7天",
            ),
        ]

    def _constraints(
        self,
        question: str,
        file_context: str | None,
        canvas: dict[str, str] | None,
    ) -> list[str]:
        constraints: list[str] = []
        text = "\n".join([question, file_context or "", " ".join((canvas or {}).values())])
        for kw in ("预算", "时间", "合同", "合规", "数据", "渠道", "成本", "团队"):
            if kw in text:
                constraints.append(f"存在「{kw}」相关约束，需要进入验证计划。")
        return constraints[:5] or ["资源、时间、渠道和数据约束尚未明确，需要补充。"]

    def _unknown_assumptions(self, routing: RoutingDecision, context: FusedContext) -> list[str]:
        assumptions: list[str] = []
        for node in context.nodes[:4]:
            question = node.key_questions[0] if node.key_questions else node.core_principle
            if question:
                assumptions.append(f"假设「{node.node_name}」成立：{question}")
        if not assumptions:
            assumptions = [
                "假设目标客户真实存在且痛点足够强。",
                "假设价值主张能被客户快速感知并转化为付费。",
                "假设获客与交付成本不会吞噬毛利。",
            ]
        return assumptions[:6]

    def _archive_candidates(self, question: str, context: FusedContext) -> list[str]:
        candidates = [f"用户问题：{_clip(question, 80)}"]
        candidates.extend(f"方法论应用：{node.node_name}" for node in context.nodes[:3])
        return candidates[:5]

    def _missing_information(self, routing: RoutingDecision, canvas: dict[str, str] | None) -> list[str]:
        missing = []
        labels = {
            "customer_segments": "目标客户/购买者/使用者",
            "value_propositions": "价值主张和差异化",
            "channels": "首个获客渠道",
            "revenue_streams": "定价和收入来源",
            "cost_structure": "主要成本与毛利",
        }
        for module in routing.canvas_modules or labels.keys():
            if not (canvas or {}).get(module):
                missing.append(labels.get(module, module))
        return [f"需要补充：{item}" for item in missing[:5]]

    def _contradictions(self, project_history: str | None) -> list[str]:
        history = project_history or ""
        contradictions: list[str] = []
        if "未达成" in history:
            contradictions.append("历史验证卡存在未达成结果，本轮推演不能继续默认相关假设成立。")
        if "部分达成" in history:
            contradictions.append("历史验证反馈显示部分达成，需要区分已验证事实与仍待验证假设。")
        return contradictions[:4]

    def _assumption_status(
        self,
        routing: RoutingDecision,
        context: FusedContext,
        project_history: str | None,
    ) -> list[TianjiAssumptionStatus]:
        assumptions = self._unknown_assumptions(routing, context)[:4]
        failed = bool(project_history and "未达成" in project_history)
        partial = bool(project_history and "部分达成" in project_history)
        status = "failed" if failed else "partial" if partial else "unknown"
        evidence = (
            "同项目历史验证卡存在未达成反馈。"
            if failed
            else "同项目历史验证卡存在部分达成反馈。"
            if partial
            else "当前缺少同项目验证回填证据。"
        )
        return [
            TianjiAssumptionStatus(assumption=item, status=status, evidence=evidence)
            for item in assumptions
        ]


def _clip(text: str | None, limit: int) -> str:
    text = " ".join((text or "").split())
    return text[:limit]


def _first_sentence(text: str) -> str:
    return re.split(r"[。！？!?；;\n]", text.strip(), maxsplit=1)[0][:120]


def _extract_line(text: str | None, key: str) -> str:
    if not text:
        return ""
    for line in text.splitlines():
        if line.strip().startswith(f"{key}："):
            return line.split("：", 1)[-1].strip()
    return ""


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dict_list(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _join_focus(items: list[str]) -> str:
    return "、".join(items[:3]) if items else "关键证据"


def _cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, min(dot / (na * nb), 1.0))
