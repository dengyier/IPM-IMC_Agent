"""ProblemRoutingService —— 问题意图 → 核心方法论节点的路由规则生成（算法三）。

负责：基于 10 类标准商业问题意图与触发关键词，把核心方法论节点映射到对应意图，
生成 ProblemRoutingRule，供后续问题路由与诊断 Agent 调用。

匹配逻辑（确定性、可离线运行）：
- 每个意图带一组 trigger_keywords 与 canvas_modules。
- 节点是否命中某意图：节点文本（name/definition/principle/thinking/scenarios）
  与意图关键词或意图名做包含匹配。
- 命中度最高的若干节点进入 required_node_ids，其余相关节点进入 optional_node_ids。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import MethodologyNode, ProblemRoutingRule
from app.schemas.diagnosis import RoutingDecision

# --------------------------------------------------------------------------- #
# 10 类标准商业问题意图
# --------------------------------------------------------------------------- #

DEFAULT_INTENTS: list[dict] = [
    {
        "intent": "project_feasibility",
        "intent_description": "判断一个项目/创业想法是否值得做、是否可行。",
        "trigger_keywords": ["可行", "靠谱", "值得做", "要不要做", "立项", "项目", "机会", "假设", "验证"],
        "canvas_modules": ["value_propositions", "customer_segments", "revenue_streams", "cost_structure"],
    },
    {
        "intent": "business_model_design",
        "intent_description": "设计或重塑商业模式，理清价值创造与捕获方式。",
        "trigger_keywords": ["商业模式", "怎么赚钱", "盈利模式", "模式设计", "画布", "价值创造", "价值捕获"],
        "canvas_modules": [
            "value_propositions", "customer_segments", "channels",
            "revenue_streams", "key_resources", "key_activities",
            "key_partners", "cost_structure", "customer_relationships",
        ],
    },
    {
        "intent": "customer_definition",
        "intent_description": "明确目标客户是谁、客户细分与真实需求。",
        "trigger_keywords": ["客户", "用户", "目标人群", "细分", "客户细分", "需求", "痛点", "谁会买"],
        "canvas_modules": ["customer_segments", "value_propositions", "customer_relationships"],
    },
    {
        "intent": "value_proposition_check",
        "intent_description": "检验价值主张是否成立、是否真正解决客户问题。",
        "trigger_keywords": ["价值主张", "卖点", "差异化", "为什么选我", "解决什么问题", "价值"],
        "canvas_modules": ["value_propositions", "customer_segments", "channels"],
    },
    {
        "intent": "revenue_model_check",
        "intent_description": "检验收入模式与定价、现金流是否健康。",
        "trigger_keywords": ["收入", "定价", "价格", "现金流", "毛利", "付费", "收费", "复购", "客单价"],
        "canvas_modules": ["revenue_streams", "cost_structure", "customer_segments"],
    },
    {
        "intent": "risk_diagnosis",
        "intent_description": "识别项目/模式中的关键风险与致命假设。",
        "trigger_keywords": ["风险", "隐患", "致命", "最大问题", "会不会失败", "假设不成立", "陷阱"],
        "canvas_modules": ["key_activities", "key_resources", "cost_structure", "revenue_streams"],
    },
    {
        "intent": "go_to_market",
        "intent_description": "规划进入市场、获客与增长路径。",
        "trigger_keywords": ["获客", "增长", "进入市场", "渠道", "推广", "营销", "冷启动", "拉新", "市场"],
        "canvas_modules": ["channels", "customer_relationships", "customer_segments", "value_propositions"],
    },
    {
        "intent": "brand_positioning",
        "intent_description": "确立品牌定位与心智差异。",
        "trigger_keywords": ["品牌", "定位", "心智", "形象", "认知", "差异化定位"],
        "canvas_modules": ["value_propositions", "customer_segments", "channels"],
    },
    {
        "intent": "organization_execution",
        "intent_description": "评估组织能力、团队与关键活动的执行落地。",
        "trigger_keywords": ["组织", "团队", "执行", "落地", "能力", "关键活动", "资源", "伙伴", "协作"],
        "canvas_modules": ["key_activities", "key_resources", "key_partners"],
    },
    {
        "intent": "investment_decision",
        "intent_description": "投资/投入决策：是否投、投多少、回报与代价。",
        "trigger_keywords": ["投资", "投入", "回报", "要不要投", "估值", "代价", "ROI", "决策"],
        "canvas_modules": ["revenue_streams", "cost_structure", "key_resources", "value_propositions"],
    },
]


class ProblemRoutingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------ #
    # generate rules
    # ------------------------------------------------------------------ #

    def generate_rules(self, replace_existing: bool = True) -> list[ProblemRoutingRule]:
        """为 10 类意图生成路由规则，把节点映射到 required / optional。"""
        nodes = self.db.query(MethodologyNode).filter(MethodologyNode.status == "active").all()

        if replace_existing:
            self.db.query(ProblemRoutingRule).delete()
            self.db.flush()

        rules: list[ProblemRoutingRule] = []
        for priority, spec in enumerate(DEFAULT_INTENTS, start=1):
            scored = self._score_nodes(nodes, spec)
            required = [nid for nid, score in scored if score >= 2][:5]
            optional = [nid for nid, score in scored if 0 < score < 2][:8]
            # 至少保留 1 个命中度最高的节点为 required（若有任何命中）
            if not required and scored and scored[0][1] > 0:
                required = [scored[0][0]]
                optional = [nid for nid, _ in scored[1:9]]

            rule = ProblemRoutingRule(
                intent=spec["intent"],
                intent_description=spec["intent_description"],
                trigger_keywords=list(spec["trigger_keywords"]),
                required_node_ids=required,
                optional_node_ids=optional,
                canvas_modules=list(spec["canvas_modules"]),
                routing_priority=priority,
                status="active",
            )
            self.db.add(rule)
            rules.append(rule)

        self.db.flush()
        return rules

    # ------------------------------------------------------------------ #
    # runtime routing（算法四）：问题 → 意图 → 节点
    # ------------------------------------------------------------------ #

    def route(self, question: str, canvas: dict[str, str] | None = None) -> RoutingDecision:
        """根据用户问题与画布内容匹配最合适的意图与方法论节点。"""
        text = (question or "") + "\n" + "\n".join((canvas or {}).values())
        rules = (
            self.db.query(ProblemRoutingRule)
            .filter(ProblemRoutingRule.status == "active")
            .order_by(ProblemRoutingRule.routing_priority)
            .all()
        )
        if not rules:
            return RoutingDecision(
                intent="business_model_design",
                intent_description="无可用路由规则，回退到通用商业模式设计。",
                matched_score=0,
            )

        best, best_score = rules[0], -1
        for rule in rules:
            score = sum(1 for kw in (rule.trigger_keywords or []) if kw in text)
            if score > best_score:
                best, best_score = rule, score

        return RoutingDecision(
            intent=best.intent,
            intent_description=best.intent_description,
            matched_score=max(best_score, 0),
            required_node_ids=list(best.required_node_ids or []),
            optional_node_ids=list(best.optional_node_ids or []),
            canvas_modules=list(best.canvas_modules or []),
        )

    # ------------------------------------------------------------------ #
    # internal
    # ------------------------------------------------------------------ #

    def _score_nodes(
        self, nodes: list[MethodologyNode], spec: dict
    ) -> list[tuple[str, int]]:
        """对每个节点按关键词命中次数打分，降序返回 (node_id, score)。"""
        keywords = list(spec["trigger_keywords"])
        scored: list[tuple[str, int]] = []
        for node in nodes:
            text = self._node_text(node)
            score = sum(1 for kw in keywords if kw in text)
            # 类别直接命中关键词额外加权
            if node.node_category and any(kw in node.node_category for kw in keywords):
                score += 1
            if score > 0:
                scored.append((node.id, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    @staticmethod
    def _node_text(node: MethodologyNode) -> str:
        parts = [
            node.node_name or "",
            node.node_category or "",
            node.definition or "",
            node.core_principle or "",
            node.core_thinking or "",
        ]
        parts.extend(node.applicable_scenarios or [])
        parts.extend(node.key_questions or [])
        return "\n".join(parts)
