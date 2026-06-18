"""Tianji-BACH 假设树引擎（v2 算法地基）。

职责边界（docs/天机AI-天机推演算法设计方案-v2.md §2 设计公理）：
- LLM 只做语义工作：生成可证伪假设、判定证据归属/等级/似然比；
- 置信度更新、同源折减、裁决全部是确定性代码，任何时刻可由账本全量重放复现；
- LLM 不可用时不编造数据：假设走规则模板，证据以零效力入账留痕。
"""

from __future__ import annotations

import json
import math

from sqlalchemy.orm import Session

from app.db.base import utc_now
from app.db.models import TianjiEvidenceRecord, TianjiHypothesis, TianjiPrediction, ValidationCard
from app.services.llm import LLMService


# 证据等级 → |log10 似然比| 上限（§5.2：一条 A 级证据 ≈ 13 条 D 级）
GRADE_LOG_LR_CAP: dict[str, float] = {"A": 1.0, "B": 0.7, "C": 0.5, "D": 0.18}
# 同源同向第 k 条证据折减系数（§5.4，防刷分；反向证据全额入账）
SAME_SOURCE_DECAY = 0.6
# 维度默认先验 P（P1 占位；P5 起改为病例库参考类基率）
DIMENSION_PRIOR_P: dict[str, float] = {
    "customer_demand": 0.5,
    "willingness_to_pay": 0.3,
    "channel": 0.4,
    "unit_economics": 0.4,
    "delivery": 0.5,
    "competition": 0.5,
    "compliance": 0.6,
    "partner_fit": 0.45,
    "community_supply": 0.45,
    "trust_transfer": 0.4,
    "governance": 0.5,
}
IMPACT_MAP = {"high": 1.0, "medium": 0.6, "low": 0.3}

# 裁决阈值（§9.2）
CONTINUE_THRESHOLD = 0.70
ADJUST_THRESHOLD = 0.40
SUPPORTED_P = 0.85
REFUTED_P = 0.15


def probability(logodds: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-logodds))


def logodds(p: float) -> float:
    p = min(max(p, 0.01), 0.99)
    return math.log10(p / (1.0 - p))


# ------------------------------------------------------------------ #
# 假设树生成（案例创建时调用一次）
# ------------------------------------------------------------------ #

_HYPOTHESES_SYSTEM_PROMPT = """你是商业决策验证教练。把用户的商业决策拆成 4-6 个可证伪的关键假设。
只输出 JSON 对象，结构：
{
  "hypotheses": [
    {
      "statement": "可证伪的假设陈述，必须含可观测的对象与阈值，如：目标企业愿意为该服务年付3万元以上",
      "dimension": "customer_demand|willingness_to_pay|channel|unit_economics|delivery|competition|compliance|partner_fit|community_supply|trust_transfer|governance",
      "falsified_by": "观测到什么即可推翻该假设",
      "validated_by": "观测到什么即可支持该假设",
      "impact": "high|medium|low"
    }
  ]
}
硬性要求：
1. customer_demand 与 willingness_to_pay 两个维度必须各有一条；
2. 假设之间互不蕴含；
3. 禁止"市场有需求"这类不可证伪的表述。"""


def generate_hypotheses(
    db: Session,
    card: ValidationCard,
    llm: LLMService | None,
) -> list[TianjiHypothesis]:
    """为决策案例生成假设树并落库。已存在则直接返回现有假设。"""
    existing = list_hypotheses(db, card.id)
    if existing:
        return existing

    items = _llm_hypotheses(llm, card) or _fallback_hypotheses(card)
    rows: list[TianjiHypothesis] = []
    for item in items[:6]:
        dimension = item.get("dimension") if item.get("dimension") in DIMENSION_PRIOR_P else "customer_demand"
        prior = round(logodds(DIMENSION_PRIOR_P[dimension]), 4)
        rows.append(
            TianjiHypothesis(
                tenant_id=card.tenant_id,
                case_id=card.id,
                statement=str(item.get("statement") or "")[:500],
                dimension=dimension,
                falsified_by=str(item.get("falsified_by") or "")[:500],
                validated_by=str(item.get("validated_by") or "")[:500],
                prior_logodds=prior,
                current_logodds=prior,
                impact_weight=IMPACT_MAP.get(str(item.get("impact") or "medium"), 0.6),
            )
        )
    db.add_all(rows)
    db.flush()
    return rows


def _llm_hypotheses(llm: LLMService | None, card: ValidationCard) -> list[dict] | None:
    if not llm or not llm.available:
        return None
    user_prompt = (
        f"商业决策：{card.title}\n"
        f"背景：{card.project_summary}\n"
        f"目标客户：{card.target_customer or '未知'}\n"
        f"最大不确定性：{card.biggest_uncertainty}"
    )
    data = llm.chat_json(_HYPOTHESES_SYSTEM_PROMPT, user_prompt, temperature=0.2, max_tokens=2000)
    if not isinstance(data, dict) or not isinstance(data.get("hypotheses"), list):
        return None
    items = [item for item in data["hypotheses"] if isinstance(item, dict) and item.get("statement")]
    return items if len(items) >= 3 else None


def _fallback_hypotheses(card: ValidationCard) -> list[dict]:
    """无 LLM 时的规则模板：覆盖必选维度，陈述尽量挂接卡片字段。"""
    customer = card.target_customer or "目标客户"
    if _is_opc_community_partnership(card):
        partner = "创享产城" if "创享产城" in f"{card.title} {card.project_summary}" else "合作方"
        return [
            {
                "statement": f"{partner}与我方资源互补，能共同支撑OPC社区冷启动",
                "dimension": "partner_fit",
                "falsified_by": "合作方无法确认可调用资源、负责人或实际投入边界",
                "validated_by": "双方确认至少3类可调用合作资源，并明确负责人",
                "impact": "high",
            },
            {
                "statement": "OPC社区能提供高质量共创议题、方法资产和交付供给",
                "dimension": "community_supply",
                "falsified_by": "潜在成员认为议题泛化、无产出或与经营问题无关",
                "validated_by": "至少3个共创议题被目标成员认为值得参加并能产出资产",
                "impact": "high",
            },
            {
                "statement": f"{customer}愿意为OPC社区付出时间、材料或小额费用承诺",
                "dimension": "willingness_to_pay",
                "falsified_by": "目标成员只表示兴趣但拒绝报名、提交材料或付费",
                "validated_by": "至少5位目标成员报名，其中至少2位提交材料或支付小额费用",
                "impact": "high",
            },
            {
                "statement": f"{partner}的场景、渠道或品牌信任能迁移为OPC社区参与",
                "dimension": "trust_transfer",
                "falsified_by": "合作方入口无法带来高承诺成员，响应率不高于泛邀请",
                "validated_by": "合作方或成员转介绍入口带来至少3位高承诺成员",
                "impact": "medium",
            },
            {
                "statement": "OPC社区治理、权益边界和收益分配能够被双方接受",
                "dimension": "governance",
                "falsified_by": "双方在成员权益、资产归属、线索收益或退出机制上存在重大分歧",
                "validated_by": "双方确认一页社区治理与收益分配草案无重大分歧",
                "impact": "medium",
            },
            {
                "statement": "OPC社区首轮投入的单位经济可闭环，能形成可复用经营资产或商业回报",
                "dimension": "unit_economics",
                "falsified_by": "首轮运营和交付成本超过可承受投入，且无明确收入或资产复用路径",
                "validated_by": "预算、成员承诺、服务线索和资产复用价值能支撑继续小额验证",
                "impact": "medium",
            },
        ]
    return [
        {
            "statement": f"{customer}存在真实、高频、愿意花时间解决的痛点",
            "dimension": "customer_demand",
            "falsified_by": "多数受访者无法描述具体损失或场景",
            "validated_by": "至少60%受访者能描述具体损失并主动追问方案",
            "impact": "high",
        },
        {
            "statement": f"{customer}愿意为该方案付出金钱或可执行承诺",
            "dimension": "willingness_to_pay",
            "falsified_by": "客户只表达兴趣但拒绝订金、预约或付费",
            "validated_by": "出现订金、预付或书面采购意向",
            "impact": "high",
        },
        {
            "statement": "存在一个可低成本稳定触达目标客户的渠道",
            "dimension": "channel",
            "falsified_by": "渠道报价或转化数据显示获客成本高于客单价承载力",
            "validated_by": "至少一个渠道带来可计量的高意向线索",
            "impact": "medium",
        },
        {
            "statement": "单位经济可闭环：毛利能覆盖获客与交付成本",
            "dimension": "unit_economics",
            "falsified_by": "实测 CAC 或交付成本使毛利为负",
            "validated_by": "小样本实测毛利为正且可复制",
            "impact": "medium",
        },
    ]


def _is_opc_community_partnership(card: ValidationCard) -> bool:
    text = f"{card.title or ''} {card.project_summary or ''} {card.target_customer or ''}"
    lowered = text.lower()
    return (
        "opc" in lowered
        and any(key in text for key in ["社区", "社群", "共同体"])
        and any(key in text for key in ["合作", "共建", "一起", "一同", "创享", "产城"])
    )


# ------------------------------------------------------------------ #
# 证据入账（确定性核心）
# ------------------------------------------------------------------ #

_ASSESS_SYSTEM_PROMPT = """你是证据评审员。判断一条证据属于哪个假设、证据等级和对数似然比。
只输出 JSON 对象：
{"hypothesis_id": "目标假设的id", "grade": "A|B|C|D", "log_lr": 0.0, "rationale": "一句话理由"}

等级标准（决定 log_lr 的绝对值上限）：
- A 行为性·不可逆（真实付款、签约、复购）：|log_lr| ≤ 1.0
- B 行为性·可逆（订金、预约、留资、试用）：|log_lr| ≤ 0.7
- C 言语性·具体（给出数字、预算、流程细节）：|log_lr| ≤ 0.5
- D 言语性·泛化（口头兴趣、点赞、认可）：|log_lr| ≤ 0.18

log_lr 含义：log10(P(证据|假设为真) / P(证据|假设为假))。支持假设为正，反驳为负。
判断方向时保持冷酷：口头热情是弱证据；与钱、时间、承诺相关的行为才是强证据。"""


# 评审分歧阈值：多模型 log_lr 极差超过该值标记 disputed 并降权 50%
DISPUTE_SPREAD_THRESHOLD = 0.6
DISPUTE_DISCOUNT = 0.5
# 等级严格度：数值越小撬动力越小，聚合时取最严格（上限最小）等级
_GRADE_STRICTNESS = {"D": 0, "C": 1, "B": 2, "A": 3}


def record_evidence(
    db: Session,
    card: ValidationCard,
    *,
    content: str,
    source_type: str,
    source_ref: str,
    llm: LLMService | None,
    reviewers: list[LLMService] | tuple[LLMService, ...] | None = None,
) -> TianjiEvidenceRecord | None:
    """证据入账：异构模型评审 → 稳健聚合 → 等级截断 → 同源折减 → 更新假设置信度。

    评审独立性来自模型异构（主模型 + reviewer 池各评一次）：
    - 假设归属取多数票（平票从主模型）；
    - grade 取最严格者（似然比上限以最严格等级截断）；
    - log_lr 取中位数；极差 > 0.6 标记 disputed 并降权 50%。
    返回 None 表示该案例尚无假设树。所有模型不可用时以零效力入账留痕，不编造方向。
    """
    hypotheses = list_hypotheses(db, card.id)
    if not hypotheses:
        return None

    assessments = _collect_assessments(content, hypotheses, llm, list(reviewers or []))
    if assessments:
        hypothesis_id, grade, log_lr_raw, spread, detail = _aggregate_assessments(assessments)
        hypothesis = next((h for h in hypotheses if h.id == hypothesis_id), hypotheses[0])
    else:
        hypothesis = max(hypotheses, key=lambda h: _uncertainty(h))
        grade, log_lr_raw, spread = "D", 0.0, 0.0
        detail = {"rationale": "LLM 不可用，零效力入账留痕", "reviewer": "fallback", "reviewers": []}

    cap = GRADE_LOG_LR_CAP.get(grade, GRADE_LOG_LR_CAP["D"])
    clamped = max(-cap, min(log_lr_raw, cap))
    disputed = spread > DISPUTE_SPREAD_THRESHOLD
    if disputed:
        clamped *= DISPUTE_DISCOUNT
        detail["disputed"] = True
    decay = _same_source_decay(db, hypothesis, source_ref, clamped)
    effective = round(clamped * decay, 4)

    record = TianjiEvidenceRecord(
        tenant_id=card.tenant_id,
        case_id=card.id,
        hypothesis_id=hypothesis.id,
        content=content[:2000],
        source_type=source_type,
        source_ref=source_ref[:255],
        grade=grade,
        log_lr_raw=round(log_lr_raw, 4),
        log_lr_effective=effective,
        reviewer_spread=round(spread, 4),
        review_detail=detail,
    )
    db.add(record)

    hypothesis.current_logodds = round(hypothesis.current_logodds + effective, 4)
    hypothesis.status = _status_for(probability(hypothesis.current_logodds))
    db.add(hypothesis)
    db.flush()
    return record


def record_computed_evidence(
    db: Session,
    card: ValidationCard,
    *,
    hypothesis: TianjiHypothesis,
    content: str,
    grade: str,
    log_lr: float,
    source_type: str,
    source_ref: str,
    detail: dict | None = None,
) -> TianjiEvidenceRecord:
    """确定性计算产生的证据（如蒙特卡洛沙盘）直接入账：不经 LLM 评审，等级截断与同源折减照常。"""
    cap = GRADE_LOG_LR_CAP.get(grade, GRADE_LOG_LR_CAP["D"])
    clamped = max(-cap, min(log_lr, cap))
    decay = _same_source_decay(db, hypothesis, source_ref, clamped)
    effective = round(clamped * decay, 4)
    record = TianjiEvidenceRecord(
        tenant_id=card.tenant_id,
        case_id=card.id,
        hypothesis_id=hypothesis.id,
        content=content[:2000],
        source_type=source_type,
        source_ref=source_ref[:255],
        grade=grade,
        log_lr_raw=round(log_lr, 4),
        log_lr_effective=effective,
        review_detail={"reviewer": "deterministic", **(detail or {})},
    )
    db.add(record)
    hypothesis.current_logodds = round(hypothesis.current_logodds + effective, 4)
    hypothesis.status = _status_for(probability(hypothesis.current_logodds))
    db.add(hypothesis)
    db.flush()
    return record


def _collect_assessments(
    content: str,
    hypotheses: list[TianjiHypothesis],
    llm: LLMService | None,
    reviewers: list[LLMService],
) -> list[dict]:
    """主模型 + 评审池并行独立评估；失败的模型直接跳过。"""
    pool = [svc for svc in [llm, *reviewers] if svc is not None and getattr(svc, "available", False)]
    if not pool:
        return []
    if len(pool) == 1:
        result = _llm_assess(pool[0], content, hypotheses)
        return [dict(result, model=getattr(pool[0], "model", "primary"))] if result else []

    from concurrent.futures import ThreadPoolExecutor

    assessments: list[dict] = []
    with ThreadPoolExecutor(max_workers=len(pool)) as executor:
        futures = [(svc, executor.submit(_llm_assess, svc, content, hypotheses)) for svc in pool]
        for svc, future in futures:
            try:
                result = future.result(timeout=120)
            except Exception:  # noqa: BLE001 - 单个评审失败不阻塞聚合
                result = None
            if result:
                assessments.append(dict(result, model=getattr(svc, "model", "unknown")))
    return assessments


def _aggregate_assessments(assessments: list[dict]) -> tuple[str, str, float, float, dict]:
    """稳健聚合：归属多数票 → 最严等级 → log_lr 中位数 → 极差作分歧度。"""
    votes: dict[str, int] = {}
    for item in assessments:
        votes[item["hypothesis_id"]] = votes.get(item["hypothesis_id"], 0) + 1
    majority_count = max(votes.values())
    # 平票时取主模型（assessments[0]）所选的假设
    hypothesis_id = next(
        item["hypothesis_id"] for item in assessments if votes[item["hypothesis_id"]] == majority_count
    )
    chosen = [item for item in assessments if item["hypothesis_id"] == hypothesis_id]

    grade = min((item["grade"] for item in chosen), key=lambda g: _GRADE_STRICTNESS.get(g, 0))
    values = sorted(float(item["log_lr"]) for item in chosen)
    mid = len(values) // 2
    median = values[mid] if len(values) % 2 == 1 else (values[mid - 1] + values[mid]) / 2
    spread = (values[-1] - values[0]) if len(values) > 1 else 0.0

    detail = {
        "aggregation": "median",
        "reviewer": "heterogeneous" if len(assessments) > 1 else "llm-single",
        "reviewers": [
            {
                "model": item.get("model", "unknown"),
                "hypothesis_id": item["hypothesis_id"],
                "grade": item["grade"],
                "log_lr": float(item["log_lr"]),
                "rationale": str(item.get("rationale") or "")[:200],
            }
            for item in assessments
        ],
    }
    return hypothesis_id, grade, median, spread, detail


def _llm_assess(
    llm: LLMService | None,
    content: str,
    hypotheses: list[TianjiHypothesis],
) -> dict | None:
    if not llm or not llm.available:
        return None
    catalog = [
        {"id": h.id, "statement": h.statement, "dimension": h.dimension}
        for h in hypotheses
    ]
    user_prompt = f"候选假设：{json.dumps(catalog, ensure_ascii=False)}\n\n证据：{content}"
    data = llm.chat_json(_ASSESS_SYSTEM_PROMPT, user_prompt, temperature=0.1, max_tokens=600)
    if not isinstance(data, dict):
        return None
    grade = str(data.get("grade") or "").upper()
    if grade not in GRADE_LOG_LR_CAP:
        return None
    if not any(h.id == data.get("hypothesis_id") for h in hypotheses):
        return None
    try:
        log_lr = float(data.get("log_lr"))
    except (TypeError, ValueError):
        return None
    return {
        "hypothesis_id": data["hypothesis_id"],
        "grade": grade,
        "log_lr": log_lr,
        "rationale": str(data.get("rationale") or ""),
    }


def _same_source_decay(
    db: Session,
    hypothesis: TianjiHypothesis,
    source_ref: str,
    clamped_log_lr: float,
) -> float:
    """同源同向第 k 条证据折减为 ρ^k；反向证据（坏消息）全额入账。"""
    if not source_ref or clamped_log_lr == 0.0:
        return 1.0
    prior_same_direction = (
        db.query(TianjiEvidenceRecord)
        .filter(
            TianjiEvidenceRecord.hypothesis_id == hypothesis.id,
            TianjiEvidenceRecord.source_ref == source_ref,
        )
        .all()
    )
    k = sum(
        1
        for row in prior_same_direction
        if row.log_lr_effective != 0 and (row.log_lr_effective > 0) == (clamped_log_lr > 0)
    )
    return SAME_SOURCE_DECAY**k


def _status_for(p: float) -> str:
    if p >= SUPPORTED_P:
        return "supported"
    if p <= REFUTED_P:
        return "refuted"
    return "open"


def _uncertainty(h: TianjiHypothesis) -> float:
    p = probability(h.current_logodds)
    return 4.0 * p * (1.0 - p)


# ------------------------------------------------------------------ #
# 查询 / 重放 / 裁决
# ------------------------------------------------------------------ #

def list_hypotheses(db: Session, case_id: str) -> list[TianjiHypothesis]:
    return (
        db.query(TianjiHypothesis)
        .filter(TianjiHypothesis.case_id == case_id)
        .order_by(TianjiHypothesis.impact_weight.desc(), TianjiHypothesis.created_at.asc())
        .all()
    )


def replay_case(db: Session, case_id: str) -> dict[str, float]:
    """从账本全量重放每个假设的对数几率（审计用，应与 current_logodds 一致）。"""
    result: dict[str, float] = {}
    for h in list_hypotheses(db, case_id):
        total = h.prior_logodds
        records = (
            db.query(TianjiEvidenceRecord)
            .filter(TianjiEvidenceRecord.hypothesis_id == h.id)
            .order_by(TianjiEvidenceRecord.created_at.asc())
            .all()
        )
        for row in records:
            # 与增量更新同样的逐步舍入，保证重放结果与 current_logodds 完全一致
            total = round(total + row.log_lr_effective, 4)
        result[h.id] = total
    return result


def _verdict_for(p_overall: float) -> str:
    if p_overall >= CONTINUE_THRESHOLD:
        return "continue"
    if p_overall >= ADJUST_THRESHOLD:
        return "adjust"
    return "pause"


def _weighted_overall(probs: dict[str, float], weights: dict[str, float]) -> float:
    total = sum(weights.values()) or 1.0
    return sum(weights[key] * probs[key] for key in probs) / total


def _sensitivity_weights(hypotheses: list[TianjiHypothesis]) -> tuple[dict[str, float], set[str]]:
    """敏感性分析（§8.2）：把单个假设的 P 强制置 0 / 置 1，重跑裁决。

    线性加权聚合下 |ΔP_overall| 数学上恒等比于结构权重本身，不构成新信号；
    真正的非线性来自裁决阈值——若两个端点的裁决结论不同，该假设是「决定性假设」，
    有效权重提升为 1.0；否则保持结构权重。不回写数据库列，结构权重始终可恢复。
    """
    base_probs = {h.id: probability(h.current_logodds) for h in hypotheses}
    structural = {h.id: h.impact_weight for h in hypotheses}
    effective: dict[str, float] = {}
    decisive: set[str] = set()
    for h in hypotheses:
        low = _weighted_overall({**base_probs, h.id: 0.0}, structural)
        high = _weighted_overall({**base_probs, h.id: 1.0}, structural)
        if _verdict_for(low) != _verdict_for(high):
            decisive.add(h.id)
            effective[h.id] = 1.0
        else:
            effective[h.id] = structural[h.id]
    return effective, decisive


def adjudicate(db: Session, case_id: str) -> dict | None:
    """综合裁决（§9.2 确定性函数）+ 敏感性有效权重（§8.2）。无假设树时返回 None。"""
    hypotheses = list_hypotheses(db, case_id)
    if not hypotheses:
        return None

    effective_weights, decisive = _sensitivity_weights(hypotheses)
    probs = {h.id: probability(h.current_logodds) for h in hypotheses}
    p_overall = _weighted_overall(probs, effective_weights)

    # 一票否决：决定性/高影响假设被 A/B 级证据证伪
    vetoed = None
    for h in hypotheses:
        if effective_weights[h.id] >= 0.95 and h.status == "refuted" and _has_strong_refutation(db, h):
            vetoed = h
            break

    verdict = "pause" if vetoed else _verdict_for(p_overall)

    reasons = _adjudication_reasons(hypotheses, vetoed, effective_weights)
    kill_criteria = [
        {"hypothesis_id": h.id, "signal": h.falsified_by}
        for h in hypotheses
        if effective_weights[h.id] >= 0.5 and h.falsified_by and h.status != "refuted"
    ][:4]

    return {
        "probability": round(p_overall, 4),
        "verdict": verdict,
        "vetoed_by": vetoed.id if vetoed else None,
        "reasons": reasons,
        "kill_criteria": kill_criteria,
        "hypotheses": [
            {
                "id": h.id,
                "statement": h.statement,
                "dimension": h.dimension,
                "probability": round(probability(h.current_logodds), 4),
                "impact_weight": round(effective_weights[h.id], 2),
                "structural_weight": h.impact_weight,
                "decisive": h.id in decisive,
                "status": h.status,
            }
            for h in hypotheses
        ],
    }


def _has_strong_refutation(db: Session, hypothesis: TianjiHypothesis) -> bool:
    return bool(
        db.query(TianjiEvidenceRecord)
        .filter(
            TianjiEvidenceRecord.hypothesis_id == hypothesis.id,
            TianjiEvidenceRecord.grade.in_(["A", "B"]),
            TianjiEvidenceRecord.log_lr_effective < 0,
        )
        .first()
    )


def _adjudication_reasons(
    hypotheses: list[TianjiHypothesis],
    vetoed: TianjiHypothesis | None,
    effective_weights: dict[str, float] | None = None,
) -> list[str]:
    if vetoed:
        return [f"关键假设被强证据证伪：{vetoed.statement}"]
    weights = effective_weights or {h.id: h.impact_weight for h in hypotheses}
    ranked = sorted(
        (h for h in hypotheses if weights.get(h.id, 0) >= 0.5),
        key=lambda h: probability(h.current_logodds),
    )
    reasons = []
    for h in ranked[:3]:
        p = probability(h.current_logodds)
        if p < 0.6:
            reasons.append(f"「{h.statement[:24]}」置信度 {int(p * 100)}%，证据不足")
    return reasons or ["关键假设均有证据支撑，可按 kill criteria 控制下行风险"]


# ------------------------------------------------------------------ #
# 预测记录（裁决留痕 + Day7 评分闭环）
# ------------------------------------------------------------------ #

def create_prediction(db: Session, card: ValidationCard, adjudication: dict) -> TianjiPrediction:
    prediction = TianjiPrediction(
        tenant_id=card.tenant_id,
        case_id=card.id,
        verdict=adjudication["verdict"],
        probability=adjudication["probability"],
        probability_raw=adjudication["probability"],
        kill_criteria=adjudication["kill_criteria"],
    )
    db.add(prediction)
    db.flush()
    return prediction


def resolve_predictions(db: Session, card: ValidationCard) -> None:
    """Day7 复盘回填：用验证卡真实结果给未决预测评分。"""
    outcome_map = {"achieved": 1.0, "partially_achieved": 0.5, "not_achieved": 0.0}
    outcome = outcome_map.get(card.result or "")
    if outcome is None:
        return
    pending = (
        db.query(TianjiPrediction)
        .filter(TianjiPrediction.case_id == card.id, TianjiPrediction.outcome.is_(None))
        .all()
    )
    now = utc_now()
    for prediction in pending:
        prediction.outcome = outcome
        prediction.brier = round((prediction.probability - outcome) ** 2, 4)
        prediction.resolved_at = now
        db.add(prediction)
