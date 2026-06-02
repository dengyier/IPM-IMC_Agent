"""ReportQualityService —— 诊断报告质量自检（算法九）。

评分公式::

    score = 基础质量维度 + consulting_structure（深度报告结构完整度）+ safety

其中 safety 检查报告是否泄露了核心方法论切块原文——一旦泄露，safety=0 并强制不通过。
"""

from __future__ import annotations

from app.schemas.diagnosis import CANVAS_MODULES
from app.services.context_fusion_service import FusedContext

WEIGHTS = {
    "canvas_completeness": 0.15,
    "methodology_alignment": 0.18,
    "assumption": 0.12,
    "risk": 0.12,
    "actionability": 0.13,
    "evidence": 0.10,
    "consulting_structure": 0.15,
    "safety": 0.05,
}

PASS_THRESHOLD = 0.70


class ReportQualityService:
    def check(
        self, report_payload: dict, context: FusedContext, canvas: dict
    ) -> dict:
        scores: dict[str, float] = {}
        issues: list[str] = []
        suggestions: list[str] = []

        # 1. canvas_completeness：9 模块填写比例
        filled = sum(1 for m in CANVAS_MODULES if (canvas or {}).get(m, "").strip())
        scores["canvas_completeness"] = round(filled / len(CANVAS_MODULES), 4)
        if filled < len(CANVAS_MODULES):
            issues.append(f"画布仅填写 {filled}/9 模块，完整度不足。")
            suggestions.append("补全缺失的画布模块以提升诊断可靠性。")

        # 2. methodology_alignment：报告是否真的「援引」了路由到的方法论节点
        #    （旧实现用 node_ids/routed，分子分母同源恒等 1.0，是假信号；改为统计正文实际点名）
        node_ids = report_payload.get("methodology_node_ids", [])
        report_text = _report_text(report_payload)
        routed_names = [
            n.node_name for n in context.nodes if getattr(n, "node_name", "")
        ]
        cited = sum(1 for name in routed_names if name and name in report_text)
        if not routed_names:
            scores["methodology_alignment"] = 0.0
        else:
            expected = min(len(routed_names), 5)  # 引用到 5 个相关节点即视为充分对齐
            scores["methodology_alignment"] = round(min(cited / expected, 1.0), 4)
        if not node_ids:
            issues.append("报告未对齐任何核心方法论节点。")
            suggestions.append("确保诊断结论锚定核心方法论判断。")
        elif cited == 0:
            issues.append("报告未在结论中显式援引方法论节点，方法论契合度偏低。")
            suggestions.append("在分析中点名引用相关方法论（如「依据『价值主张画布』…」）。")

        # 3. assumption：数量 × 论述深度
        assumptions = report_payload.get("key_assumptions", [])
        scores["assumption"] = _depth_score(assumptions, good_count=5, good_len=40)
        if not assumptions:
            issues.append("未列出关键假设。")
            suggestions.append("显式列出诊断所依赖的关键假设。")

        # 4. risk：数量 × 论述深度（鼓励写明影响/严重度/缓解）
        risks = report_payload.get("risks", [])
        scores["risk"] = _depth_score(risks, good_count=4, good_len=34)
        if not risks:
            issues.append("未识别风险。")
            suggestions.append("补充关键风险与触发条件。")

        # 5. actionability：数量 × 论述深度（鼓励写明怎么验证/成功判据）
        actions = report_payload.get("recommended_actions", [])
        scores["actionability"] = _depth_score(actions, good_count=4, good_len=34)
        if not actions:
            issues.append("缺少可执行的下一步建议。")
            suggestions.append("给出可验证、可落地的下一步动作。")

        # 6. evidence：引用条数（结构化引用，按数量评估即可）
        evidence = report_payload.get("evidence_refs", [])
        scores["evidence"] = _ramp(len(evidence), good=5)
        if not evidence:
            issues.append("缺少证据引用。")
            suggestions.append("引用方法论节点或已审核扩展作为证据。")

        # 7. safety：报告不得泄露核心切块原文
        required_sections = [
            ("executive_summary", "执行摘要"),
            ("core_tensions", "核心矛盾"),
            ("cross_canvas_logic", "交叉画布逻辑"),
            ("unit_economics", "单位经济模型"),
            ("risk_matrix", "风险矩阵"),
            ("mvp_validation_path", "MVP 验证路径"),
            ("ninety_day_plan", "90 天行动计划"),
            ("final_recommendation", "最终决策建议"),
        ]
        present = 0
        for key, label in required_sections:
            value = report_payload.get(key)
            if value:
                present += 1
            else:
                issues.append(f"缺少{label}。")
                suggestions.append(f"补充{label}以达到咨询式深度报告要求。")
        rich_modules = 0
        for finding in (report_payload.get("module_findings") or {}).values():
            if isinstance(finding, dict) and finding.get("business_impact") and finding.get("hypotheses_to_validate"):
                rich_modules += 1
        structure_score = 0.7 * (present / len(required_sections)) + 0.3 * (rich_modules / len(CANVAS_MODULES))
        scores["consulting_structure"] = round(structure_score, 4)

        # 8. safety：报告不得泄露核心切块原文
        leaked = self._detect_core_leak(report_payload, context)
        scores["safety"] = 0.0 if leaked else 1.0
        if leaked:
            issues.append("报告疑似泄露核心方法论原始资料内容，已判定不安全。")
            suggestions.append("移除核心切块原文，仅保留消化后的方法论判断。")

        overall = round(sum(WEIGHTS[k] * scores[k] for k in WEIGHTS), 4)
        passed = overall >= PASS_THRESHOLD and not leaked

        return {
            "overall_score": overall,
            "dimension_scores": scores,
            "passed": passed,
            "issues": issues,
            "suggestions": suggestions,
        }

    # ------------------------------------------------------------------ #

    def _detect_core_leak(self, report_payload: dict, context: FusedContext) -> bool:
        """检查报告文本是否包含核心切块原文片段（>=20 字连续重合即判定泄露）。"""
        chunk_texts = [
            (c.get("text") or "").strip()
            for c in context.core_chunks
            if c.get("text")
        ]
        if not chunk_texts:
            return False
        report_text = _report_text(report_payload)
        for ct in chunk_texts:
            # 取核心切块的若干较长片段做包含检测
            for i in range(0, max(1, len(ct) - 20), 20):
                frag = ct[i : i + 20]
                if len(frag) >= 20 and frag in report_text:
                    return True
        return False


def _report_text(payload: dict) -> str:
    parts = [payload.get("overall_summary", "")]
    parts.extend(payload.get("key_assumptions", []))
    parts.extend(payload.get("risks", []))
    parts.extend(payload.get("recommended_actions", []))
    for key in (
        "executive_summary",
        "core_tensions",
        "cross_canvas_logic",
        "unit_economics",
        "risk_matrix",
        "mvp_validation_path",
        "ninety_day_plan",
        "final_recommendation",
    ):
        parts.append(payload.get(key, ""))
    for finding in (payload.get("module_findings") or {}).values():
        if isinstance(finding, dict):
            parts.append(finding.get("assessment", ""))
            parts.extend(finding.get("issues", []))
            parts.extend(finding.get("suggestions", []))
            parts.append(finding.get("current_judgement", ""))
            parts.extend(finding.get("evidence_and_observations", []))
            parts.extend(finding.get("key_issues", []))
            parts.append(finding.get("business_impact", ""))
            parts.extend(finding.get("hypotheses_to_validate", []))
            parts.extend(finding.get("recommended_actions", []))
            parts.extend(finding.get("metrics_to_track", []))
            parts.extend(finding.get("methodology_basis", []))
    return "\n".join(str(p) for p in parts)


def _ramp(count: int, good: int) -> float:
    """0 个=0 分，达到 good 个=1.0 分，线性。"""
    if count <= 0:
        return 0.0
    return round(min(count / good, 1.0), 4)


def _depth_score(items: list, good_count: int, good_len: int) -> float:
    """数量充分度 × 论述深度的混合分：

    - 数量：达到 good_count 条得满；
    - 深度：各条平均字数达到 good_len 得满；
    各占一半。避免「凑够条数即满分」，让单薄的报告得分更低、真实可区分。
    """
    cleaned = [str(x).strip() for x in (items or []) if str(x).strip()]
    if not cleaned:
        return 0.0
    qty = min(len(cleaned) / good_count, 1.0)
    avg_len = sum(len(x) for x in cleaned) / len(cleaned)
    depth = min(avg_len / good_len, 1.0)
    return round(0.5 * qty + 0.5 * depth, 4)
