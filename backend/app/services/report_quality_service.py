"""ReportQualityService —— 诊断报告质量自检（算法九）。

评分公式::

    score = 0.20·canvas_completeness + 0.20·methodology_alignment + 0.15·assumption
          + 0.15·risk + 0.15·actionability + 0.10·evidence + 0.05·safety

其中 safety 检查报告是否泄露了核心方法论切块原文——一旦泄露，safety=0 并强制不通过。
"""

from __future__ import annotations

from app.schemas.diagnosis import CANVAS_MODULES
from app.services.context_fusion_service import FusedContext

WEIGHTS = {
    "canvas_completeness": 0.20,
    "methodology_alignment": 0.20,
    "assumption": 0.15,
    "risk": 0.15,
    "actionability": 0.15,
    "evidence": 0.10,
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

        # 2. methodology_alignment：引用的方法论节点覆盖度
        node_ids = report_payload.get("methodology_node_ids", [])
        routed = len(context.nodes) or 1
        scores["methodology_alignment"] = round(min(len(node_ids) / routed, 1.0), 4)
        if not node_ids:
            issues.append("报告未对齐任何核心方法论节点。")
            suggestions.append("确保诊断结论锚定核心方法论判断。")

        # 3. assumption
        assumptions = report_payload.get("key_assumptions", [])
        scores["assumption"] = _ramp(len(assumptions), good=2)
        if not assumptions:
            issues.append("未列出关键假设。")
            suggestions.append("显式列出诊断所依赖的关键假设。")

        # 4. risk
        risks = report_payload.get("risks", [])
        scores["risk"] = _ramp(len(risks), good=2)
        if not risks:
            issues.append("未识别风险。")
            suggestions.append("补充关键风险与触发条件。")

        # 5. actionability
        actions = report_payload.get("recommended_actions", [])
        scores["actionability"] = _ramp(len(actions), good=2)
        if not actions:
            issues.append("缺少可执行的下一步建议。")
            suggestions.append("给出可验证、可落地的下一步动作。")

        # 6. evidence
        evidence = report_payload.get("evidence_refs", [])
        scores["evidence"] = _ramp(len(evidence), good=3)
        if not evidence:
            issues.append("缺少证据引用。")
            suggestions.append("引用方法论节点或已审核扩展作为证据。")

        # 7. safety：报告不得泄露核心切块原文
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
    for finding in (payload.get("module_findings") or {}).values():
        if isinstance(finding, dict):
            parts.append(finding.get("assessment", ""))
            parts.extend(finding.get("issues", []))
            parts.extend(finding.get("suggestions", []))
    return "\n".join(str(p) for p in parts)


def _ramp(count: int, good: int) -> float:
    """0 个=0 分，达到 good 个=1.0 分，线性。"""
    if count <= 0:
        return 0.0
    return round(min(count / good, 1.0), 4)
