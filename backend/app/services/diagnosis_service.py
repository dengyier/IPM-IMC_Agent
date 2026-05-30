"""DiagnosisService —— 商业画布诊断（算法八）。

输入：用户画布(9 模块) + 问题 + 路由结果 + 融合上下文。
输出：逐模块诊断 + 关键假设 + 风险 + 可执行建议 + 证据引用 + 总体结论。

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
    "你是基于港大 IMC&IPM 核心方法论的商业决策诊断专家。请基于提供的方法论判断要点与"
    "用户画布，输出结构化诊断。要求：回到商业本质、点出关键假设与风险、给出可验证的下一步；"
    "绝不照搬或泄露方法论原始课件文本；只输出 JSON 对象。"
)


class DiagnosisService:
    def __init__(self, llm: LLMService | None = None) -> None:
        self.llm = llm

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
        # 只传消化后的方法论判断要点，绝不传核心切块原文
        method_points = [
            {
                "node": n.node_name,
                "principle": n.core_principle,
                "thinking": n.core_thinking,
                "decision_logic": n.decision_logic,
                "key_questions": n.key_questions,
            }
            for n in context.nodes[:8]
        ]
        expansions = [
            {"type": e.extension_type, "title": e.title, "summary": e.summary}
            for e in (context.approved_expansions + context.cases)[:6]
        ]
        user = (
            f"商业问题：{request.question or '（未提供，按画布整体诊断）'}\n"
            f"意图：{routing.intent}\n"
            f"画布输入(JSON)：{request.canvas}\n"
            f"方法论判断要点(JSON)：{method_points}\n"
            f"已审核补充证据(JSON)：{expansions}\n\n"
            "请输出 JSON，字段："
            "module_findings(对象，键为画布模块英文名，值含 assessment/issues[]/suggestions[]), "
            "key_assumptions[], risks[], recommended_actions[], overall_summary。"
        )
        data = self.llm.chat_json(DIAGNOSIS_SYSTEM, user)
        if not data:
            return None
        return self._assemble(data, routing, context)

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
                module_findings[module] = {
                    "assessment": f"{label}尚未填写。"
                    + ("该模块与当前问题强相关，建议优先补全。" if focus else "建议补全以完善画布。"),
                    "issues": [f"{label}信息缺失，无法判断其假设是否成立。"],
                    "suggestions": [f"补充{label}的具体内容，并标注其依赖的关键假设。"],
                }
                continue
            issues, suggestions = self._module_checks(module, filled, context)
            module_findings[module] = {
                "assessment": f"{label}已填写。"
                + ("属于当前问题的核心模块，需重点验证其关键假设。" if focus else "整体方向可参考方法论判断进一步打磨。"),
                "issues": issues,
                "suggestions": suggestions,
            }

        key_assumptions = self._collect_assumptions(context)
        risks = self._collect_risks(context, canvas, target_modules)
        actions = self._collect_actions(context, target_modules)
        summary = self._summary(request, routing, context, module_findings)

        data = {
            "module_findings": module_findings,
            "key_assumptions": key_assumptions,
            "risks": risks,
            "recommended_actions": actions,
            "overall_summary": summary,
        }
        return self._assemble(data, routing, context)

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
        self, data: dict, routing: RoutingDecision, context: FusedContext
    ) -> dict:
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
            "module_findings": data.get("module_findings", {}),
            "key_assumptions": _as_list(data.get("key_assumptions")),
            "risks": _as_list(data.get("risks")),
            "recommended_actions": _as_list(data.get("recommended_actions")),
            "overall_summary": data.get("overall_summary", ""),
            "evidence_refs": evidence_refs,
            "methodology_node_ids": [n.id for n in context.nodes],
            "intent": routing.intent,
        }


def _as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]
