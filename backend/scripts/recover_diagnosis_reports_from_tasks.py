"""Recover diagnosis reports from succeeded diagnosis task results.

Older builds sometimes stored the generated report only in tasks.result.
This script backfills diagnosis_reports and report_quality_checks so the
report center can display those historical results after refresh.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.models import DiagnosisReport, ReportQualityCheck, Task  # noqa: E402
from app.db.session import SessionLocal, init_db  # noqa: E402


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def main() -> None:
    init_db()
    db = SessionLocal()
    recovered_reports = 0
    recovered_quality = 0
    try:
        tasks = (
            db.query(Task)
            .filter(Task.task_type.in_(("diagnosis.diagnose", "diagnosis.regenerate")))
            .filter(Task.status == "succeeded")
            .order_by(Task.created_at.asc())
            .all()
        )
        for task in tasks:
            result = task.result or {}
            report_data = result.get("report") if isinstance(result, dict) else None
            if not isinstance(report_data, dict):
                continue

            report_id = str(report_data.get("id") or "")
            if not report_id:
                continue

            if db.get(DiagnosisReport, report_id) is None:
                report = DiagnosisReport(
                    id=report_id,
                    title=report_data.get("title") or "未命名诊断报告",
                    company_name=report_data.get("company_name"),
                    question=report_data.get("question") or "",
                    intent=report_data.get("intent"),
                    canvas_input=report_data.get("canvas_input") or {},
                    module_findings=report_data.get("module_findings") or {},
                    key_assumptions=report_data.get("key_assumptions") or [],
                    risks=report_data.get("risks") or [],
                    recommended_actions=report_data.get("recommended_actions") or [],
                    evidence_refs=report_data.get("evidence_refs") or [],
                    methodology_node_ids=report_data.get("methodology_node_ids") or [],
                    overall_summary=report_data.get("overall_summary") or "",
                    quality_score=float(report_data.get("quality_score") or 0),
                    status=report_data.get("status") or "draft",
                    used_llm=bool(report_data.get("used_llm")),
                    created_at=parse_dt(report_data.get("created_at")) or task.created_at,
                    updated_at=parse_dt(report_data.get("updated_at")) or task.updated_at,
                )
                db.add(report)
                recovered_reports += 1

            quality_data = result.get("quality") if isinstance(result, dict) else None
            if not isinstance(quality_data, dict):
                continue

            quality_id = str(quality_data.get("id") or "")
            if quality_id and db.get(ReportQualityCheck, quality_id) is None:
                quality = ReportQualityCheck(
                    id=quality_id,
                    report_id=quality_data.get("report_id") or report_id,
                    overall_score=float(quality_data.get("overall_score") or 0),
                    dimension_scores=quality_data.get("dimension_scores") or {},
                    passed=bool(quality_data.get("passed")),
                    issues=quality_data.get("issues") or [],
                    suggestions=quality_data.get("suggestions") or [],
                    created_at=parse_dt(quality_data.get("created_at")) or task.completed_at,
                )
                db.add(quality)
                recovered_quality += 1

        db.commit()
    finally:
        db.close()

    print(
        f"Recovered {recovered_reports} diagnosis reports and "
        f"{recovered_quality} quality checks."
    )


if __name__ == "__main__":
    main()
