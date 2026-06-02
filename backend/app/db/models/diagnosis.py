"""Phase 3 — 商业画布诊断 (Business Canvas Diagnosis) 数据模型。

核心约束：
- 诊断优先级：核心方法论节点 > 核心切块 context > 已审核外部扩展 > 已审核企业案例
  > 未审核资料不参与正式诊断。
- 诊断报告不得暴露核心方法论原始资料内容（只引用节点名/消化后的方法论判断）。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonType, uid, utc_now


class DiagnosisReport(Base):
    """一次商业画布诊断的完整报告。"""

    __tablename__ = "diagnosis_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255))
    question: Mapped[str] = mapped_column(Text, default="")
    intent: Mapped[str | None] = mapped_column(String(120))
    report_depth: Mapped[str] = mapped_column(String(40), default="consulting")
    # 用户填写的 9 模块画布输入
    canvas_input: Mapped[dict] = mapped_column(JsonType, default=dict)
    # 逐模块诊断：{module: {assessment, issues[], suggestions[]}}
    module_findings: Mapped[dict] = mapped_column(JsonType, default=dict)
    executive_summary: Mapped[dict] = mapped_column(JsonType, default=dict)
    core_tensions: Mapped[list] = mapped_column(JsonType, default=list)
    cross_canvas_logic: Mapped[list] = mapped_column(JsonType, default=list)
    unit_economics: Mapped[dict] = mapped_column(JsonType, default=dict)
    risk_matrix: Mapped[list] = mapped_column(JsonType, default=list)
    mvp_validation_path: Mapped[list] = mapped_column(JsonType, default=list)
    ninety_day_plan: Mapped[dict] = mapped_column(JsonType, default=dict)
    final_recommendation: Mapped[dict] = mapped_column(JsonType, default=dict)
    key_assumptions: Mapped[list] = mapped_column(JsonType, default=list)
    risks: Mapped[list] = mapped_column(JsonType, default=list)
    recommended_actions: Mapped[list] = mapped_column(JsonType, default=list)
    # 证据引用：方法论节点名/已审核扩展，绝不含核心切块原文
    evidence_refs: Mapped[list] = mapped_column(JsonType, default=list)
    methodology_node_ids: Mapped[list] = mapped_column(JsonType, default=list)
    overall_summary: Mapped[str] = mapped_column(Text, default="")
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    # draft / checked / published
    status: Mapped[str] = mapped_column(String(40), default="draft")
    used_llm: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class ReportQualityCheck(Base):
    """诊断报告质量自检结果（算法九）。"""

    __tablename__ = "report_quality_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(
        ForeignKey("diagnosis_reports.id"), nullable=False
    )
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    # 7 维度分数明细
    dimension_scores: Mapped[dict] = mapped_column(JsonType, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    issues: Mapped[list] = mapped_column(JsonType, default=list)
    suggestions: Mapped[list] = mapped_column(JsonType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
