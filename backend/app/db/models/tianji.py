"""天机推演 v2（Tianji-BACH）持久化状态。

三张表构成推演引擎的数学骨架（见 docs/天机AI-天机推演算法设计方案-v2.md §4）：
- TianjiHypothesis：可证伪假设节点，置信度以对数几率存储；
- TianjiEvidenceRecord：证据账本，每条记录带等级与对数似然比，置信度可全量重放复现；
- TianjiPrediction：裁决预测记录，Day7 复盘回填后用 Brier 分数给系统自己打分。

case_id 统一锚定 ValidationCard.id（一次 7 天验证 = 一个决策案例）。
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class TianjiHypothesis(Base):
    __tablename__ = "tianji_hypotheses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    case_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), index=True)

    # 假设陈述，必须可证伪（"目标客户愿意为 X 支付 ≥ Y 元"，而非"市场有需求"）
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    # customer_demand | willingness_to_pay | channel | unit_economics | delivery | competition | compliance
    dimension: Mapped[str] = mapped_column(String(40), default="customer_demand", nullable=False)
    # 何种观测推翻 / 支持该假设——验证动作的种子，也是 kill criteria 的来源
    falsified_by: Mapped[str] = mapped_column(Text, default="")
    validated_by: Mapped[str] = mapped_column(Text, default="")

    # 先验对数几率（以 10 为底；来自参考类基率或维度默认值）
    prior_logodds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 当前对数几率 = prior + Σ log_lr_effective，由证据入账时增量维护（只读派生值）
    current_logodds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 对最终裁决的影响力 0~1（P1 由 LLM 标注高/中/低映射，P4 改为敏感性分析计算）
    impact_weight: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)

    # open | supported | refuted | stale
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class TianjiEvidenceRecord(Base):
    __tablename__ = "tianji_evidence_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    case_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    hypothesis_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    # 证据原文：一句话事实，非推断
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # internal_kg | project_evidence | external_search | user_input | case_library | simulation
    source_type: Mapped[str] = mapped_column(String(40), default="user_input", nullable=False)
    # 来源定位：节点 id / 验证卡动作 / URL / 病例 id，同源折减按此分组
    source_ref: Mapped[str] = mapped_column(String(255), default="")

    # A | B | C | D，决定 |log_lr| 上限（§5.2 映射表）
    grade: Mapped[str] = mapped_column(String(4), default="D", nullable=False)
    # 评审输出的对数似然比（以 10 为底，正=支持假设，负=反驳）
    log_lr_raw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 实际入账值 = clamp(raw, 等级上限) × 同源折减系数
    log_lr_effective: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 多模型评审分歧度（极差），P1 单模型恒为 0
    reviewer_spread: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # 评审明细（各模型估值、理由），保留审计现场
    review_detail: Mapped[dict] = mapped_column(JsonType, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class TianjiPrediction(Base):
    __tablename__ = "tianji_predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    case_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    # continue | adjust | pause（§9.2 裁决函数输出）
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)
    # 裁决时的综合置信度（P5 启用 Platt 校准后为校准值）
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    # 校准前原始值，留作校准训练数据
    probability_raw: Mapped[float] = mapped_column(Float, nullable=False)
    # 触发即停的信号清单 [{hypothesis_id, signal}]
    kill_criteria: Mapped[list] = mapped_column(JsonType, default=list)

    # Day7 复盘回填：continue/adjust 且达成 → 1，pause 或未达成 → 0
    outcome: Mapped[float | None] = mapped_column(Float)
    # (probability − outcome)²，回填后计算
    brier: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
