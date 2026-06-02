"""DiagnosisService —— 商业画布诊断（算法八）。

输入：用户画布(9 模块) + 问题 + 路由结果 + 融合上下文。
输出：咨询式深度诊断 + 九宫格深度分析 + 风险矩阵 + 验证路线图。

铁律：
- 优先依据核心方法论节点(消化后的判断)，不得把核心切块原文写入报告。
- 只引用已审核扩展/案例作为补充证据。
"""

from __future__ import annotations

from app.schemas.diagnosis import CANVAS_MODULES, DiagnoseRequest, RoutingDecision
from app.services.context_fusion_service import FusedContext
from app.services.llm import LLMService

MODULE_LABELS = {
    "customer_segments": "客户细分",
    "value_propositions": "价值主张",
    "channels": "渠道通路",
    "customer_relationships": "客户关系",
    "revenue_streams": "收入来源",
    "key_resources": "核心资源",
    "key_activities": "关键业务",
    "key_partners": "重要伙伴",
    "cost_structure": "成本结构",
}

DIAGNOSIS_SYSTEM = (
    "你是香港大学 IMC&IPM（整合营销传播 & 整合项目管理）核心方法论的资深商业决策诊断顾问。\n"
    "你的任务：基于提供的『方法论判断要点』和用户的『商业模式画布』，产出一份能给企业老板、投资人、"
    "新业务负责人使用的**咨询式深度商业诊断报告**。\n\n"
    "诊断原则：\n"
    "1. 回到商业本质——先判断客户与价值主张是否成立，再看模式能否闭环、能否规模化。\n"
    "2. 每一处判断都要『有据可依』：在分析中明确点名你援引了哪条方法论（如「依据『价值主张画布』…」），"
    "并把方法论的关键问题转化为对该项目的具体追问。\n"
    "3. 区分『事实 / 假设 / 风险』：清楚指出哪些是用户已陈述的事实，哪些是尚未验证的关键假设。\n"
    "4. 必须做九宫格之间的交叉推理，识别关键矛盾、因果链条、商业闭环和单位经济约束。\n"
    "5. 建议必须可执行、可验证、有先后次序，构成一条 MVP 最小验证路径与 90 天行动计划。\n"
    "6. 语言专业、具体、就事论事，避免空话套话；结合本项目的行业与细节展开。\n\n"
    "硬性约束：绝不照搬或泄露方法论原始课件文本（只用消化后的判断要点）；"
    "后端会用结构化协议接收你的内容，但所有字段内容必须是可直接展示给用户的中文咨询报告文本，"
    "不要在任何字段值里写代码块、JSON 字符串、字典文本、Markdown 表格源码或花括号结构。"
)


class DiagnosisService:
    def __init__(self, llm: LLMService | None = None) -> None:
        self.llm = llm
        self.summary_generator = ExecutiveSummaryGenerator()
        self.canvas_analyzer = CanvasDeepAnalyzer()
        self.cross_reasoner = CrossCanvasReasoner()
        self.unit_economics_analyzer = UnitEconomicsAnalyzer()
        self.risk_builder = RiskMatrixBuilder()
        self.roadmap_planner = RoadmapPlanner()

    def diagnose(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
    ) -> tuple[dict, bool]:
        """返回 (report_payload, used_llm)。"""
        llm_result = self._llm_diagnose(request, routing, context)
        if llm_result:
            return llm_result, True
        return self._local_diagnose(request, routing, context), False

    # ------------------------------------------------------------------ #
    # LLM 诊断
    # ------------------------------------------------------------------ #

    def _llm_diagnose(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
    ) -> dict | None:
        if not self.llm or not self.llm.available:
            return None
        # 只传消化后的方法论判断要点，绝不传核心切块原文（扩大节点数与字段，给 LLM 更厚的依据）
        method_points = [
            {
                "node": n.node_name,
                "category": getattr(n, "node_category", None),
                "definition": n.definition,
                "principle": n.core_principle,
                "thinking": n.core_thinking,
                "decision_logic": n.decision_logic,
                "key_questions": n.key_questions,
                "applicable_scenarios": n.applicable_scenarios,
            }
            for n in context.nodes[:12]
        ]
        expansions = [
            {"type": e.extension_type, "title": e.title, "summary": e.summary}
            for e in (context.approved_expansions + context.cases)[:8]
        ]
        # 画布按中文标签呈现，便于 LLM 对齐
        canvas_cn = {
            MODULE_LABELS.get(m, m): (request.canvas or {}).get(m, "").strip() or "（未填写）"
            for m in CANVAS_MODULES
        }
        user = (
            f"# 项目\n标题：{request.title}\n"
            f"主体：{request.company_name or '（未提供）'}\n"
            f"重点关注的问题：{request.question or '（未提供，请按画布整体诊断）'}\n"
            f"识别意图：{routing.intent}\n\n"
            f"# 商业模式画布（用户填写，中文键）\n{canvas_cn}\n\n"
            f"# 可援引的方法论判断要点（港大 IMC&IPM，共 {len(method_points)} 条，已消化）\n{method_points}\n\n"
            f"# 已审核的补充证据 / 案例（可作为佐证，{len(expansions)} 条）\n{expansions}\n\n"
            f"# 报告深度\n{request.report_depth}\n\n"
            "# 内部结构化返回要求（注意：字段值必须是自然语言报告内容，不能包含 JSON 字符串或代码块）\n"
            "{\n"
            '  "executive_summary": {\n'
            '    "one_sentence_judgement": "一句话判断项目是否值得继续推进，以及最大前提",\n'
            '    "overall_score": 0.0,\n'
            '    "maturity_stage": "概念验证/早期验证/增长验证/规模化前夜/成熟优化",\n'
            '    "top_3_findings": ["结论+依据+影响", "..."],\n'
            '    "top_3_risks": ["风险+影响", "..."],\n'
            '    "recommended_decision": "继续推进/小规模验证/暂缓/重构，说明条件"\n'
            '  },\n'
            '  "overall_summary": "300~600字总体诊断：商业本质判断、核心矛盾、商业闭环、最高优先级动作",\n'
            '  "core_tensions": [{"tension": "关键矛盾", "why_it_matters": "为什么重要", "affected_canvas_modules": ["customer_segments"], "priority": "high"}],\n'
            '  "module_findings": {\n'
            '     "<画布模块英文键>": {\n'
            '        "assessment": "兼容字段：该模块总体评估，120~220字",\n'
            '        "issues": ["兼容字段：具体问题"],\n'
            '        "suggestions": ["兼容字段：建议"],\n'
            '        "current_judgement": "当前判断：是否成立、成熟度、最大不确定性",\n'
            '        "evidence_and_observations": ["依据与观察：必须结合用户输入和方法论节点", "..."],\n'
            '        "key_issues": ["关键问题：具体到业务场景", "..."],\n'
            '        "business_impact": "对商业模式的影响，说明会如何牵动其他画布模块",\n'
            '        "hypotheses_to_validate": ["待验证假设，写清验证对象", "..."],\n'
            '        "recommended_actions": ["建议动作，写清怎么做", "..."],\n'
            '        "metrics_to_track": ["关键指标，如CAC/LTV/转化率/复购率/毛利率等", "..."],\n'
            '        "methodology_basis": ["明确点名援引的方法论节点名", "..."],\n'
            '        "confidence": 0.0\n'
            "     }\n"
            "  },\n"
            '  "cross_canvas_logic": [{"logic_chain": "客户细分不清 → 价值主张分散 → 渠道成本升高 → 收入模型不稳定", "explanation": "因果解释", "priority": "high"}],\n'
            '  "unit_economics": {"revenue_items": [], "cost_items": [], "gross_margin_assumptions": [], "cac_ltv_framework": "", "break_even_logic": "", "missing_data": []},\n'
            '  "risk_matrix": [{"risk": "", "impact": "high/medium/low", "probability": "high/medium/low", "severity": "high/medium/low", "mitigation": "", "validation_method": ""}],\n'
            '  "mvp_validation_path": [{"stage": "", "objective": "", "actions": [], "success_criteria": [], "duration": ""}],\n'
            '  "ninety_day_plan": {"day_0_30": [], "day_31_60": [], "day_61_90": []},\n'
            '  "final_recommendation": {"go_conditions": [], "pause_conditions": [], "missing_information": [], "final_judgement": ""},\n'
            '  "key_assumptions": ["以『假设…，因为…，需验证…』句式列出4~6条最关键的待验证假设"],\n'
            '  "risks": ["兼容字段：由risk_matrix压缩成风险摘要，4~6条"],\n'
            '  "recommended_actions": ["兼容字段：由MVP路径和90天计划压缩成行动摘要，4~8条"]\n'
            "}\n\n"
            "注意：module_findings 必须覆盖全部 9 个画布模块英文键"
            "（customer_segments, value_propositions, channels, customer_relationships, "
            "revenue_streams, key_resources, key_activities, key_partners, cost_structure）；"
            "未填写的模块也要给出『为何重要 + 应补充什么』。内容务必结合本项目行业与具体描述展开。"
        )
        data = self.llm.chat_json(
            DIAGNOSIS_SYSTEM, user, temperature=0.35, max_tokens=24000
        )
        if not data:
            return None
        return self._assemble(data, routing, context, request)

    # ------------------------------------------------------------------ #
    # 本地确定性诊断
    # ------------------------------------------------------------------ #

    def _local_diagnose(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
    ) -> dict:
        canvas = request.canvas or {}
        target_modules = routing.canvas_modules or CANVAS_MODULES

        module_findings: dict[str, dict] = {}
        for module in CANVAS_MODULES:
            label = MODULE_LABELS.get(module, module)
            filled = (canvas.get(module) or "").strip()
            focus = module in target_modules
            if not filled:
                module_findings[module] = self.canvas_analyzer.analyze_module(
                    module=module,
                    text="",
                    context=context,
                    focus=focus,
                    issues=[f"{label}信息缺失，无法判断其假设是否成立。"],
                    suggestions=[f"补充{label}的具体内容，并标注其依赖的关键假设。"],
                )
                module_findings[module]["assessment"] = (
                    f"{label}尚未填写。"
                    + ("该模块与当前问题强相关，建议优先补全。" if focus else "建议补全以完善画布。")
                )
                continue
            issues, suggestions = self._module_checks(module, filled, context)
            module_findings[module] = self.canvas_analyzer.analyze_module(
                module=module,
                text=filled,
                context=context,
                focus=focus,
                issues=issues,
                suggestions=suggestions,
            )
            module_findings[module]["assessment"] = (
                f"{label}已填写。"
                + ("属于当前问题的核心模块，需重点验证其关键假设。" if focus else "整体方向可参考方法论判断进一步打磨。")
            )
        key_assumptions = self._collect_assumptions(context)
        risks = self._collect_risks(context, canvas, target_modules)
        actions = self._collect_actions(context, target_modules)
        summary = self._summary(request, routing, context, module_findings)

        rich = self._local_rich_sections(request, routing, context, module_findings)
        data = {
            "module_findings": module_findings,
            "key_assumptions": key_assumptions,
            "risks": risks,
            "recommended_actions": actions,
            "overall_summary": summary,
            **rich,
        }
        return self._assemble(data, routing, context, request)

    def _module_checks(
        self, module: str, text: str, context: FusedContext
    ) -> tuple[list[str], list[str]]:
        label = MODULE_LABELS.get(module, module)
        issues: list[str] = []
        suggestions: list[str] = []
        # 借用相关节点的关键问题作为检查清单
        for node in context.nodes[:3]:
            for q in node.key_questions[:2]:
                suggestions.append(f"对照「{node.node_name}」自检：{q}")
        if len(text) < 20:
            issues.append(f"{label}描述过于简略，难以验证其商业逻辑是否闭环。")
        if not any(kw in text for kw in ("客户", "价值", "成本", "收入", "假设", "验证")):
            issues.append(f"{label}缺少与客户价值/收益/成本/假设的明确关联。")
        if not issues:
            issues.append(f"{label}方向清晰，但仍需验证背后的关键假设。")
        return issues[:3], suggestions[:3]

    def _collect_assumptions(self, context: FusedContext) -> list[str]:
        out: list[str] = []
        for node in context.nodes[:4]:
            if node.key_questions:
                out.append(
                    f"围绕「{node.node_name}」的关键假设：{node.key_questions[0]}"
                )
        if not out:
            out.append("当前商业判断建立在客户需求真实存在且愿意付费的假设之上。")
        return out

    def _collect_risks(
        self, context: FusedContext, canvas: dict, target_modules: list[str]
    ) -> list[str]:
        risks: list[str] = []
        missing = [
            MODULE_LABELS.get(m, m)
            for m in target_modules
            if not (canvas.get(m) or "").strip()
        ]
        if missing:
            risks.append("关键模块缺失：" + "、".join(missing) + "，存在判断盲区。")
        for node in context.nodes[:3]:
            if node.core_principle:
                risks.append(
                    f"若违背「{node.node_name}」的核心原则，可能导致商业逻辑不成立。"
                )
        if not risks:
            risks.append("最大风险是关键假设未经验证即投入资源。")
        return risks[:5]

    def _collect_actions(
        self, context: FusedContext, target_modules: list[str]
    ) -> list[str]:
        actions: list[str] = []
        for node in context.nodes[:3]:
            if node.decision_logic:
                actions.append(
                    f"按「{node.node_name}」的决策逻辑推进：{node.decision_logic[0]}"
                )
        actions.append(
            "针对每个关键假设设计最小代价的验证动作（访谈/小规模测试/数据回看）。"
        )
        if target_modules:
            actions.append(
                "优先打磨与当前问题强相关的模块："
                + "、".join(MODULE_LABELS.get(m, m) for m in target_modules[:4])
            )
        return actions[:5]

    def _summary(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
        module_findings: dict,
    ) -> str:
        node_names = "、".join(n.node_name for n in context.nodes[:3]) or "核心方法论"
        filled = sum(
            1 for m in CANVAS_MODULES if (request.canvas or {}).get(m, "").strip()
        )
        return (
            f"针对「{request.title}」（意图：{routing.intent}），本次诊断调用了 {node_names} 等核心方法论判断，"
            f"画布已填写 {filled}/9 个模块。整体建议：回到商业本质，先验证关键假设再投入资源，"
            "补全缺失模块并对照方法论关键问题逐项自检。"
        )

    # ------------------------------------------------------------------ #
    # 组装 + 证据引用（不含核心原文）
    # ------------------------------------------------------------------ #

    def _assemble(
        self,
        data: dict,
        routing: RoutingDecision,
        context: FusedContext,
        request: DiagnoseRequest,
    ) -> dict:
        module_findings = self._normalize_module_findings(data.get("module_findings") or {})
        fallback_sections = self._local_rich_sections(request, routing, context, module_findings)
        risk_matrix = _as_dict_list(data.get("risk_matrix"))
        mvp_path = _as_dict_list(data.get("mvp_validation_path"))
        executive_summary = _as_dict(data.get("executive_summary"))
        unit_economics = _as_dict(data.get("unit_economics"))
        final_recommendation = _as_dict(data.get("final_recommendation"))
        ninety_day_plan = _as_dict(data.get("ninety_day_plan"))
        core_tensions = _as_dict_list(data.get("core_tensions"))
        cross_canvas_logic = _as_dict_list(data.get("cross_canvas_logic"))
        if not executive_summary:
            executive_summary = fallback_sections["executive_summary"]
        if not core_tensions:
            core_tensions = fallback_sections["core_tensions"]
        if not cross_canvas_logic:
            cross_canvas_logic = fallback_sections["cross_canvas_logic"]
        if not unit_economics:
            unit_economics = fallback_sections["unit_economics"]
        if not risk_matrix:
            risk_matrix = fallback_sections["risk_matrix"]
        if not mvp_path:
            mvp_path = fallback_sections["mvp_validation_path"]
        if not ninety_day_plan:
            ninety_day_plan = fallback_sections["ninety_day_plan"]
        if not final_recommendation:
            final_recommendation = fallback_sections["final_recommendation"]
        risks = _as_list(data.get("risks")) or [
            f"{r.get('risk', '')}：影响{r.get('impact', '待评估')}，概率{r.get('probability', '待评估')}，缓释动作：{r.get('mitigation', '')}"
            for r in risk_matrix
            if r.get("risk")
        ]
        recommended_actions = _as_list(data.get("recommended_actions"))
        if not recommended_actions:
            for stage in mvp_path:
                objective = stage.get("objective") or stage.get("stage") or "验证动作"
                criteria = "；".join(_as_list(stage.get("success_criteria"))) or "形成可判断的验证结果"
                recommended_actions.append(f"{objective}：{criteria}")
        evidence_refs = [
            {"type": "methodology_node", "ref": n.node_name, "node_id": n.id}
            for n in context.nodes[:8]
        ] + [
            {
                "type": "approved_expansion",
                "ref": e.title,
                "extension_type": e.extension_type,
                "expansion_id": e.id,
            }
            for e in (context.approved_expansions + context.cases)[:6]
        ]
        return {
            "report_depth": "consulting",
            "module_findings": module_findings,
            "executive_summary": executive_summary,
            "core_tensions": core_tensions,
            "cross_canvas_logic": cross_canvas_logic,
            "unit_economics": unit_economics,
            "risk_matrix": risk_matrix,
            "mvp_validation_path": mvp_path,
            "ninety_day_plan": ninety_day_plan,
            "final_recommendation": final_recommendation,
            "key_assumptions": _as_list(data.get("key_assumptions")),
            "risks": risks,
            "recommended_actions": recommended_actions,
            "overall_summary": data.get("overall_summary", ""),
            "evidence_refs": evidence_refs,
            "methodology_node_ids": [n.id for n in context.nodes],
            "intent": routing.intent,
        }

    def _normalize_module_findings(self, findings: dict) -> dict:
        normalized: dict[str, dict] = {}
        for module in CANVAS_MODULES:
            raw = findings.get(module) or {}
            if not isinstance(raw, dict):
                raw = {"assessment": str(raw)}
            issues = _as_list(raw.get("issues")) or _as_list(raw.get("key_issues"))
            suggestions = _as_list(raw.get("suggestions")) or _as_list(raw.get("recommended_actions"))
            normalized[module] = {
                "assessment": str(raw.get("assessment") or raw.get("current_judgement") or ""),
                "issues": issues,
                "suggestions": suggestions,
                "current_judgement": str(raw.get("current_judgement") or raw.get("assessment") or ""),
                "evidence_and_observations": _as_list(raw.get("evidence_and_observations")),
                "key_issues": _as_list(raw.get("key_issues")) or issues,
                "business_impact": str(raw.get("business_impact") or ""),
                "hypotheses_to_validate": _as_list(raw.get("hypotheses_to_validate")),
                "recommended_actions": _as_list(raw.get("recommended_actions")) or suggestions,
                "metrics_to_track": _as_list(raw.get("metrics_to_track")),
                "methodology_basis": _as_list(raw.get("methodology_basis")),
                "confidence": _as_float(raw.get("confidence")),
            }
        return normalized

    def _local_rich_sections(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
        module_findings: dict,
    ) -> dict:
        executive_summary = self.summary_generator.generate(request, routing, context, module_findings)
        core_tensions = self.cross_reasoner.core_tensions(request, routing, module_findings)
        cross_canvas_logic = self.cross_reasoner.logic_chains(module_findings)
        unit_economics = self.unit_economics_analyzer.analyze(request.canvas or {})
        risk_matrix = self.risk_builder.build(request.canvas or {}, module_findings, context)
        mvp_validation_path = self.roadmap_planner.mvp_path(request, routing)
        ninety_day_plan = self.roadmap_planner.ninety_day_plan(request, routing)
        final_recommendation = self.summary_generator.final_recommendation(
            executive_summary, risk_matrix, request.canvas or {}
        )
        return {
            "executive_summary": executive_summary,
            "core_tensions": core_tensions,
            "cross_canvas_logic": cross_canvas_logic,
            "unit_economics": unit_economics,
            "risk_matrix": risk_matrix,
            "mvp_validation_path": mvp_validation_path,
            "ninety_day_plan": ninety_day_plan,
            "final_recommendation": final_recommendation,
        }


class ExecutiveSummaryGenerator:
    def generate(
        self,
        request: DiagnoseRequest,
        routing: RoutingDecision,
        context: FusedContext,
        module_findings: dict,
    ) -> dict:
        filled = sum(1 for m in CANVAS_MODULES if (request.canvas or {}).get(m, "").strip())
        issue_count = sum(len(f.get("key_issues") or f.get("issues") or []) for f in module_findings.values())
        score = round(min(0.35 + filled / 18 + max(0, 6 - issue_count) * 0.03, 0.86), 2)
        stage = "概念验证" if filled <= 3 else "早期验证" if filled <= 6 else "增长验证"
        node_names = [n.node_name for n in context.nodes[:3] if n.node_name]
        return {
            "one_sentence_judgement": (
                f"「{request.title}」目前最适合以小规模验证方式推进，先证明客户需求、价值主张和收入闭环，"
                "再扩大资源投入。"
            ),
            "overall_score": score,
            "maturity_stage": stage,
            "top_3_findings": [
                f"画布已填写 {filled}/9 个模块，信息基础{'较完整' if filled >= 6 else '仍需补强'}。",
                "当前判断的关键不在单个模块，而在客户细分、价值主张、渠道和收入之间是否能形成闭环。",
                f"本次优先参考 {('、'.join(node_names) or '核心方法论节点')} 等方法论节点进行判断。",
            ],
            "top_3_risks": [
                "目标客户与真实付费者若未拆开验证，价值主张容易分散。",
                "渠道转化和获客成本未被量化前，收入模型存在乐观假设。",
                "成本结构与交付能力若未同步测算，规模化后可能侵蚀毛利。",
            ],
            "recommended_decision": "建议进入 30-60 天小规模验证，不建议直接大规模投放或重资产扩张。",
        }

    def final_recommendation(self, summary: dict, risks: list[dict], canvas: dict) -> dict:
        missing = [MODULE_LABELS[m] for m in CANVAS_MODULES if not (canvas.get(m) or "").strip()]
        high_risks = [r.get("risk", "") for r in risks if r.get("severity") == "high"]
        return {
            "go_conditions": [
                "能明确区分使用者、购买者和影响者，并验证各自的核心动机。",
                "至少一个主渠道跑通从触达到成交的转化链路，并形成可复用话术。",
                "单位经济模型中 LTV/CAC 达到 3 以上，或有明确路径在 90 天内接近该水平。",
            ],
            "pause_conditions": [
                "核心客户访谈显示需求强度不足，或付费理由主要停留在功能好奇。",
                "硬件/交付/服务成本显著高于客户可接受价格，且订阅或复购无法弥补。",
                "关键渠道 CAC 过高，无法通过复购、转介绍或客单价提升修复。",
            ],
            "missing_information": missing[:6] or ["需要补充真实转化率、复购率、毛利率、CAC、LTV 等量化数据。"],
            "final_judgement": summary.get("recommended_decision", "建议先验证关键假设，再决定是否扩大投入。"),
            "high_risk_watchlist": high_risks[:3],
        }


class CanvasDeepAnalyzer:
    def analyze_module(
        self,
        module: str,
        text: str,
        context: FusedContext,
        focus: bool,
        issues: list[str],
        suggestions: list[str],
    ) -> dict:
        label = MODULE_LABELS.get(module, module)
        basis = [n.node_name for n in context.nodes[:3] if n.node_name]
        filled = bool(text.strip())
        confidence = 0.72 if filled and focus else 0.62 if filled else 0.38
        return {
            "assessment": "",
            "issues": issues,
            "suggestions": suggestions,
            "current_judgement": (
                f"{label}已有初步描述，但仍需从客户真实行为、付费意愿和运营约束中验证。"
                if filled
                else f"{label}缺失，当前无法判断该模块是否支撑商业闭环。"
            ),
            "evidence_and_observations": [
                f"用户输入：{text[:120]}" if filled else f"用户尚未提供{label}信息。",
                f"该模块{'是' if focus else '不是'}当前诊断意图的优先模块。",
                f"可对照{('、'.join(basis) or '核心方法论')}检查其商业假设。",
            ],
            "key_issues": issues,
            "business_impact": self._impact(module),
            "hypotheses_to_validate": self._hypotheses(module),
            "recommended_actions": suggestions,
            "metrics_to_track": self._metrics(module),
            "methodology_basis": basis,
            "confidence": confidence,
        }

    def _impact(self, module: str) -> str:
        impacts = {
            "customer_segments": "客户细分会直接决定价值主张、渠道选择、销售话术和 CAC 上限。",
            "value_propositions": "价值主张若不聚焦，会导致传播信息分散、转化率下降，并削弱定价能力。",
            "channels": "渠道决定触达效率和获客成本，是收入模型能否成立的关键约束。",
            "customer_relationships": "客户关系影响复购、续费、转介绍和服务成本。",
            "revenue_streams": "收入来源决定商业闭环是否能覆盖获客、交付和持续服务成本。",
            "key_resources": "核心资源决定差异化能否被持续复制，避免竞争对手快速跟进。",
            "key_activities": "关键业务决定交付稳定性、用户体验和规模化效率。",
            "key_partners": "重要伙伴会影响渠道背书、交付成本和资源杠杆。",
            "cost_structure": "成本结构决定毛利安全边界和增长速度。成本假设不清会放大亏损风险。",
        }
        return impacts.get(module, "该模块会影响商业模式其他环节，需要与相邻模块联动判断。")

    def _hypotheses(self, module: str) -> list[str]:
        return {
            "customer_segments": ["目标客户存在高频且强烈的未满足需求。", "购买者与使用者之间的价值感知可以被同一套方案连接。"],
            "value_propositions": ["客户能清楚感知当前价值主张，并愿意为其支付溢价。", "价值主张相对竞品存在可表达、可体验的差异。"],
            "channels": ["首选渠道可以低成本触达高意向客户。", "渠道触达后的转化率足以支撑 CAC 回收。"],
            "customer_relationships": ["客户需要持续服务，而不只是一次性交易。", "关系运营可以提升复购、续费或转介绍。"],
            "revenue_streams": ["客户愿意接受当前收费方式。", "订阅/复购/增值服务能提升 LTV。"],
            "key_resources": ["现有资源足以形成差异化壁垒。", "关键资源可复制、可规模化。"],
            "key_activities": ["关键交付活动可标准化。", "服务质量不会随规模增长快速下降。"],
            "key_partners": ["伙伴能带来低成本获客或可信背书。", "合作收益足以覆盖协调成本。"],
            "cost_structure": ["主要成本项可控且随规模下降。", "毛利空间足以覆盖获客和持续服务成本。"],
        }.get(module, ["该模块的核心假设需要通过真实客户和运营数据验证。"])

    def _metrics(self, module: str) -> list[str]:
        return {
            "customer_segments": ["目标客户转化率", "访谈需求强度评分", "细分人群 CAC", "付费意愿"],
            "value_propositions": ["价值感知评分", "点击率", "询单转化率", "NPS"],
            "channels": ["渠道 CAC", "线索成本", "成交转化率", "回本周期"],
            "customer_relationships": ["复购率", "续费率", "投诉率", "转介绍率"],
            "revenue_streams": ["客单价", "订阅转化率", "LTV", "LTV/CAC"],
            "key_resources": ["资源复用率", "差异化评分", "交付瓶颈数量"],
            "key_activities": ["交付周期", "履约成本", "服务成功率", "人效"],
            "key_partners": ["伙伴转化率", "渠道贡献收入", "合作成本", "伙伴留存率"],
            "cost_structure": ["毛利率", "BOM/交付成本", "固定成本占比", "盈亏平衡销量"],
        }.get(module, ["转化率", "成本", "毛利率", "客户满意度"])


class CrossCanvasReasoner:
    def core_tensions(self, request: DiagnoseRequest, routing: RoutingDecision, module_findings: dict) -> list[dict]:
        return [
            {
                "tension": "客户细分与价值主张之间的匹配度尚未被验证",
                "why_it_matters": "如果不知道谁真正付费、谁真正使用、谁影响决策，价值主张会同时讨好多人，最终导致转化效率下降。",
                "affected_canvas_modules": ["customer_segments", "value_propositions", "channels"],
                "priority": "high",
            },
            {
                "tension": "收入模型与成本结构之间缺少单位经济校验",
                "why_it_matters": "即便需求真实存在，如果 CAC、交付成本、服务成本和毛利之间不能闭环，增长越快亏损越快。",
                "affected_canvas_modules": ["revenue_streams", "cost_structure", "channels"],
                "priority": "high",
            },
            {
                "tension": "关键资源与规模化交付之间的约束尚不清晰",
                "why_it_matters": "资源和关键业务如果依赖少数人或非标准化服务，规模化后体验和成本都会失控。",
                "affected_canvas_modules": ["key_resources", "key_activities", "key_partners"],
                "priority": "medium",
            },
        ]

    def logic_chains(self, module_findings: dict) -> list[dict]:
        return [
            {
                "logic_chain": "客户细分不清 → 价值主张分散 → 渠道投放效率下降 → CAC 升高 → 收入模型不稳定",
                "explanation": "这是最常见的早期商业模式断点。需要先用访谈和小规模投放验证首要客户，而不是同时覆盖所有人群。",
                "priority": "high",
            },
            {
                "logic_chain": "价值主张不够可感知 → 转化率偏低 → 需要更高销售成本 → 毛利被渠道和人力成本吞噬",
                "explanation": "价值主张必须能被客户在购买前快速理解，并在使用后被证明，否则营销会变成持续教育成本。",
                "priority": "high",
            },
            {
                "logic_chain": "关键活动未标准化 → 交付质量波动 → 客户关系维护成本上升 → 复购/续费受损",
                "explanation": "如果交付动作无法流程化，商业模式很难从项目制走向产品化或规模化。",
                "priority": "medium",
            },
        ]


class UnitEconomicsAnalyzer:
    def analyze(self, canvas: dict) -> dict:
        return {
            "revenue_items": [
                "一次性产品/服务收入：需明确价格带、成交率和毛利率。",
                "订阅或持续服务收入：需验证月费/年费接受度、续费率和服务成本。",
                "增值服务或伙伴分成：需验证是否真实提升 LTV，而非增加复杂度。",
            ],
            "cost_items": [
                "获客成本 CAC：渠道投放、人力销售、内容运营、伙伴分佣。",
                "交付成本：产品/服务履约、客服、培训、售后、系统使用成本。",
                "固定成本：研发、管理、数据系统、关键人员成本。",
            ],
            "gross_margin_assumptions": [
                "基础版毛利需要覆盖直接交付成本，避免每单亏损。",
                "订阅/复购毛利应明显高于一次性收入，用于修复 CAC 回收周期。",
                "若硬件或人工交付毛利偏低，需要通过服务包、订阅或伙伴渠道提升整体毛利。",
            ],
            "cac_ltv_framework": "建议按渠道分别测算 CAC，并按客户细分测算 LTV。健康模型通常要求 LTV/CAC ≥ 3，CAC 回收周期不超过 6-12 个月。",
            "break_even_logic": "盈亏平衡点 = 固定成本 / 单客贡献毛利。单客贡献毛利需扣除获客、交付、售后和持续服务成本，而不是只看收入。",
            "missing_data": [
                "各渠道线索成本、成交转化率、客单价、复购率、订阅转化率、毛利率、退款率、服务成本。",
            ],
        }


class RiskMatrixBuilder:
    def build(self, canvas: dict, module_findings: dict, context: FusedContext) -> list[dict]:
        missing = [MODULE_LABELS[m] for m in CANVAS_MODULES if not (canvas.get(m) or "").strip()]
        risks = [
            {
                "risk": "目标客户与付费者未被清晰拆分",
                "impact": "high",
                "probability": "medium",
                "severity": "high",
                "mitigation": "将使用者、购买者、影响者拆成独立画像，并分别验证动机与异议。",
                "validation_method": "完成 20-30 组深访，记录付费理由、阻碍和决策链。",
            },
            {
                "risk": "价值主张未形成强感知差异",
                "impact": "high",
                "probability": "medium",
                "severity": "high",
                "mitigation": "设计 2-3 套价值主张话术和落地页，比较转化率与询单质量。",
                "validation_method": "A/B 测试点击率、留资率、咨询转化率和客户复述准确度。",
            },
            {
                "risk": "渠道获客成本超过单位经济可承受上限",
                "impact": "high",
                "probability": "medium",
                "severity": "high",
                "mitigation": "先验证低成本渠道和高意向场景，再扩大付费投放。",
                "validation_method": "按渠道记录 CAC、成交率、回本周期和 LTV/CAC。",
            },
            {
                "risk": "成本结构未被真实测算",
                "impact": "medium",
                "probability": "medium",
                "severity": "medium",
                "mitigation": "拆分固定成本、变动成本、交付成本和售后成本，建立单客贡献毛利表。",
                "validation_method": "用 10-20 个真实订单或试点样本测算贡献毛利。",
            },
        ]
        if missing:
            risks.insert(
                0,
                {
                    "risk": "关键画布模块缺失导致判断盲区",
                    "impact": "high",
                    "probability": "high",
                    "severity": "high",
                    "mitigation": f"优先补充：{'、'.join(missing[:5])}。",
                    "validation_method": "补齐画布并重新生成诊断报告，对比核心结论是否变化。",
                },
            )
        return risks[:6]


class RoadmapPlanner:
    def mvp_path(self, request: DiagnoseRequest, routing: RoutingDecision) -> list[dict]:
        return [
            {
                "stage": "需求验证",
                "objective": "确认目标客户是否存在强痛点和真实购买动机。",
                "actions": ["完成核心客户分层", "开展 20-30 组深度访谈", "提炼高频痛点和付费理由"],
                "success_criteria": ["70% 以上访谈对象能明确表达痛点", "至少 2 个细分人群表现出明确付费意愿"],
                "duration": "0-2 周",
            },
            {
                "stage": "价值主张验证",
                "objective": "验证客户是否能感知并复述核心价值。",
                "actions": ["制作 2-3 套价值主张表达", "进行落地页或销售话术 A/B 测试", "收集客户异议"],
                "success_criteria": ["留资率或咨询转化率显著高于基线", "客户能用自己的语言复述价值"],
                "duration": "2-4 周",
            },
            {
                "stage": "付费与单位经济验证",
                "objective": "验证价格、成本、CAC、LTV 是否初步闭环。",
                "actions": ["设置价格梯度", "记录渠道 CAC 与成交率", "测算单客贡献毛利"],
                "success_criteria": ["形成可复用成交路径", "LTV/CAC 接近或超过 3", "CAC 回收周期可接受"],
                "duration": "4-8 周",
            },
        ]

    def ninety_day_plan(self, request: DiagnoseRequest, routing: RoutingDecision) -> dict:
        return {
            "day_0_30": [
                "补齐商业画布缺失模块，明确首要客户、核心价值主张和关键收入假设。",
                "完成客户访谈与竞品扫描，形成客户分层、痛点清单和价值主张版本。",
                "建立基础指标表：CAC、转化率、客单价、毛利率、复购/续费率。",
            ],
            "day_31_60": [
                "开展 MVP 小规模测试，至少验证 1 个主渠道和 1 套核心话术。",
                "完成价格梯度与付费意愿测试，记录真实成交和拒绝原因。",
                "根据试点数据更新单位经济模型，识别毛利与渠道瓶颈。",
            ],
            "day_61_90": [
                "固化可复制的渠道动作、销售话术和交付流程。",
                "围绕高潜力细分客户优化产品包、服务包或订阅方案。",
                "形成下一阶段决策：继续投入、调整方向、缩小范围或暂停。",
            ],
        }


def _as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_stringify_report_value(v) for v in value if _stringify_report_value(v)]
    if isinstance(value, dict):
        text = _stringify_report_value(value)
        return [text] if text else []
    return [str(value)]


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _as_dict_list(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, dict)]


def _as_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _stringify_report_value(value) -> str:
    """把模型偶发返回的对象压成自然语言，避免对外展示 JSON/dict 样式。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        preferred_keys = (
            "risk",
            "tension",
            "logic_chain",
            "objective",
            "action",
            "recommendation",
            "assumption",
            "finding",
            "title",
            "stage",
        )
        parts: list[str] = []
        for key in preferred_keys:
            if key in value:
                text = _stringify_report_value(value.get(key))
                if text:
                    parts.append(text)
        if not parts:
            for item in value.values():
                text = _stringify_report_value(item)
                if text:
                    parts.append(text)
        return "；".join(parts[:4])
    if isinstance(value, list):
        return "；".join(_stringify_report_value(item) for item in value if _stringify_report_value(item))
    return str(value).strip()
