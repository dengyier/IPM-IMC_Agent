"""蒙特卡洛量化沙盘（v2 算法 §9.4）。

职责边界：
- LLM 只做一件事——从证据账本、验证卡与项目事实中**提取**区间参数（PERT 三点估计），
  材料里没有的参数必须放进 missing，禁止编造；
- 模拟本身是纯 Python 确定性计算（固定随机种子，可复现）；
- 输出不是「能不能回本」，而是「在目标期限内收回投入的概率分布 + 敏感性排序」；
- 沙盘结果作为 unit_economics 维度假设的一条 B 级证据入账（source_type=simulation）。
"""

from __future__ import annotations

import json
import math
import random

from sqlalchemy.orm import Session

from app.db.base import utc_now
from app.db.models import Project, TianjiEvidenceRecord, ValidationCard
from app.services import tianji_bach_service
from app.services.llm import LLMService


SIMULATIONS = 10_000
HORIZON_MONTHS = 24
DEFAULT_TARGET_MONTHS = 12

# 模拟所需参数：name → (中文标签, 是否必需)
PARAM_SPECS: dict[str, tuple[str, bool]] = {
    "unit_price": ("客单价（元）", True),
    "monthly_new_customers": ("月新增客户数", True),
    "cac": ("单客获客成本（元）", True),
    "unit_delivery_cost": ("单客交付成本（元）", True),
    "fixed_monthly_cost": ("月固定成本（元）", False),
}

_EXTRACT_SYSTEM_PROMPT = """你是商业数据提取员。从给定材料中提取单位经济模拟所需的参数区间。
只输出 JSON 对象：
{
  "investment": 计划投入金额（元，数字；材料没提到则 null）,
  "payback_target_months": 回本目标月数（材料没提到则 null）,
  "params": {
    "unit_price": {"min": 0, "mode": 0, "max": 0},
    "monthly_new_customers": {"min": 0, "mode": 0, "max": 0},
    "cac": {"min": 0, "mode": 0, "max": 0},
    "unit_delivery_cost": {"min": 0, "mode": 0, "max": 0},
    "fixed_monthly_cost": {"min": 0, "mode": 0, "max": 0}
  }
}
铁律：
1. 只允许从材料中的数字、区间或可直接换算的表述提取（如"客单价3千到8千"→ min 3000, max 8000, mode 取中间或材料强调值）；
2. 材料完全没有依据的参数，整个字段置 null——禁止用行业常识编造；
3. "30万"这类金额换算成元；
4. min ≤ mode ≤ max，单点数字可以 min=mode=max。"""


def run_sandbox(db: Session, card: ValidationCard, llm: LLMService | None) -> dict:
    """运行沙盘：提取参数 → 蒙特卡洛 → 敏感性 → 证据入账 → 结果存 card.meta。"""
    material = _collect_material(db, card)
    extraction = _extract_params(llm, material)
    if extraction is None:
        result = _unavailable(["LLM 不可用，无法从材料中提取参数"])
        return _store(db, card, result)

    params, missing = _validate_params(extraction)
    investment = _positive_number(extraction.get("investment"))
    if investment is None:
        missing.append("计划投入金额")
    if missing:
        result = _unavailable([f"缺少：{item}" for item in missing])
        return _store(db, card, result)

    target_months = int(_positive_number(extraction.get("payback_target_months")) or DEFAULT_TARGET_MONTHS)
    target_months = max(1, min(target_months, HORIZON_MONTHS))

    simulation = simulate(params, investment, target_months, seed=card.id)
    result = {
        "available": True,
        "missing": [],
        "investment": investment,
        "target_months": target_months,
        "simulations": SIMULATIONS,
        "params": {
            name: {"label": PARAM_SPECS[name][0], **value}
            for name, value in params.items()
        },
        **simulation,
        "generated_at": utc_now().isoformat(),
    }
    _ledger_sandbox_evidence(db, card, result)
    return _store(db, card, result)


# ------------------------------------------------------------------ #
# 蒙特卡洛模拟（纯计算，固定种子可复现）
# ------------------------------------------------------------------ #

def simulate(
    params: dict[str, dict],
    investment: float,
    target_months: int,
    *,
    seed: str = "tianji",
) -> dict:
    rng = random.Random(seed)
    payback_months = [_draw_payback(rng, params, investment) for _ in range(SIMULATIONS)]

    reached = [m for m in payback_months if m is not None]
    p_payback = sum(1 for m in reached if m <= target_months) / SIMULATIONS
    loss_probability = 1 - len(reached) / SIMULATIONS
    reached.sort()

    return {
        "p_payback": round(p_payback, 4),
        "loss_probability": round(loss_probability, 4),
        "payback_p50": _percentile(reached, 0.5),
        "payback_p90": _percentile(reached, 0.9),
        "tornado": _tornado(params, investment, target_months, seed),
    }


def _draw_payback(rng: random.Random, params: dict[str, dict], investment: float) -> int | None:
    price = _pert(rng, params["unit_price"])
    customers = _pert(rng, params["monthly_new_customers"])
    cac = _pert(rng, params["cac"])
    delivery = _pert(rng, params["unit_delivery_cost"])
    fixed = _pert(rng, params["fixed_monthly_cost"]) if "fixed_monthly_cost" in params else 0.0

    monthly_profit = customers * (price - cac - delivery) - fixed
    if monthly_profit <= 0:
        return None
    months = math.ceil(investment / monthly_profit)
    return months if months <= HORIZON_MONTHS else None


def _pert(rng: random.Random, spec: dict) -> float:
    low, mode, high = float(spec["min"]), float(spec["mode"]), float(spec["max"])
    if high <= low:
        return low
    alpha = 1 + 4 * (mode - low) / (high - low)
    beta = 1 + 4 * (high - mode) / (high - low)
    return low + rng.betavariate(max(alpha, 0.1), max(beta, 0.1)) * (high - low)


def _tornado(params: dict[str, dict], investment: float, target_months: int, seed: str) -> list[dict]:
    """单参数敏感性：参数固定在 min / max 两端，其余照常抽样，看 P(按期回本) 的摆动幅度。"""
    rows: list[dict] = []
    for name in params:
        deltas = []
        for bound in ("min", "max"):
            pinned = {
                key: (dict.fromkeys(("min", "mode", "max"), float(params[name][bound])) if key == name else value)
                for key, value in params.items()
            }
            rng = random.Random(f"{seed}:{name}:{bound}")
            hits = sum(
                1
                for _ in range(2000)
                if (m := _draw_payback(rng, pinned, investment)) is not None and m <= target_months
            )
            deltas.append(hits / 2000)
        rows.append(
            {
                "param": name,
                "label": PARAM_SPECS.get(name, (name, False))[0],
                "p_at_min": round(deltas[0], 4),
                "p_at_max": round(deltas[1], 4),
                "swing": round(abs(deltas[1] - deltas[0]), 4),
            }
        )
    rows.sort(key=lambda row: row["swing"], reverse=True)
    return rows


def _percentile(sorted_values: list[int], q: float) -> int | None:
    if not sorted_values:
        return None
    index = min(len(sorted_values) - 1, int(q * len(sorted_values)))
    return sorted_values[index]


# ------------------------------------------------------------------ #
# 参数提取与校验（LLM 只提取，不编造）
# ------------------------------------------------------------------ #

def _collect_material(db: Session, card: ValidationCard) -> str:
    lines = [f"决策：{card.title}", f"摘要：{card.project_summary}"]
    if card.project_id:
        project = db.get(Project, card.project_id)
        if project and isinstance(project.meta, dict):
            if project.meta.get("planned_investment"):
                lines.append(f"计划投入：{project.meta['planned_investment']}")
            if project.meta.get("decision_deadline"):
                lines.append(f"决策期限：{project.meta['decision_deadline']}")
    meta = card.meta if isinstance(card.meta, dict) else {}
    review = meta.get("day7_review")
    if isinstance(review, dict):
        lines.append(f"复盘数据：{json.dumps(review, ensure_ascii=False)}")
    records = (
        db.query(TianjiEvidenceRecord)
        .filter(TianjiEvidenceRecord.case_id == card.id, TianjiEvidenceRecord.source_type != "simulation")
        .order_by(TianjiEvidenceRecord.created_at.desc())
        .limit(30)
        .all()
    )
    if records:
        lines.append("证据账本：")
        lines.extend(f"- [{row.grade}] {row.content}" for row in records)
    return "\n".join(lines)


def _extract_params(llm: LLMService | None, material: str) -> dict | None:
    if not llm or not llm.available:
        return None
    data = llm.chat_json(_EXTRACT_SYSTEM_PROMPT, f"材料：\n{material[:4000]}", temperature=0.1, max_tokens=1200)
    return data if isinstance(data, dict) else None


def _validate_params(extraction: dict) -> tuple[dict[str, dict], list[str]]:
    raw = extraction.get("params") if isinstance(extraction.get("params"), dict) else {}
    params: dict[str, dict] = {}
    missing: list[str] = []
    for name, (label, required) in PARAM_SPECS.items():
        spec = raw.get(name)
        cleaned = _clean_spec(spec)
        if cleaned is None:
            if required:
                missing.append(label)
            continue
        params[name] = cleaned
    return params, missing


def _clean_spec(spec) -> dict | None:
    if not isinstance(spec, dict):
        return None
    try:
        low = float(spec["min"])
        mode = float(spec["mode"])
        high = float(spec["max"])
    except (KeyError, TypeError, ValueError):
        return None
    if low < 0 or not (low <= mode <= high):
        return None
    return {"min": low, "mode": mode, "max": high}


def _positive_number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


# ------------------------------------------------------------------ #
# 入账与存储
# ------------------------------------------------------------------ #

def _ledger_sandbox_evidence(db: Session, card: ValidationCard, result: dict) -> None:
    """沙盘结论入账：log_lr 由模拟概率确定性推导（log10(p/(1-p))），B 级上限截断。"""
    hypotheses = tianji_bach_service.list_hypotheses(db, card.id)
    target = next((h for h in hypotheses if h.dimension == "unit_economics"), None)
    if not target:
        return
    p = min(max(result["p_payback"], 0.01), 0.99)
    log_lr = round(math.log10(p / (1 - p)), 4)
    content = (
        f"蒙特卡洛沙盘（{result['simulations']}次）：{result['target_months']}个月内收回"
        f"{int(result['investment'])}元投入的概率为 {round(result['p_payback'] * 100, 1)}%，"
        f"完全无法回本概率 {round(result['loss_probability'] * 100, 1)}%。"
    )
    tianji_bach_service.record_computed_evidence(
        db,
        card,
        hypothesis=target,
        content=content,
        grade="B",
        log_lr=log_lr,
        source_type="simulation",
        source_ref=f"sandbox:{card.id}",
        detail={"p_payback": result["p_payback"], "tornado_top": result["tornado"][:2]},
    )


def _unavailable(missing: list[str]) -> dict:
    return {
        "available": False,
        "missing": missing,
        "investment": None,
        "target_months": None,
        "simulations": 0,
        "params": {},
        "p_payback": None,
        "loss_probability": None,
        "payback_p50": None,
        "payback_p90": None,
        "tornado": [],
        "generated_at": utc_now().isoformat(),
    }


def _store(db: Session, card: ValidationCard, result: dict) -> dict:
    meta = dict(card.meta or {})
    meta["sandbox"] = result
    card.meta = meta
    db.add(card)
    db.commit()
    return result
