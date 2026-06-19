from datetime import datetime
from types import SimpleNamespace

from app.schemas.validation import ValidationCardOut
from app.schemas.workbench import WorkbenchAction


def test_validation_card_response_accepts_numeric_parent_id_from_stored_actions():
    card = SimpleNamespace(
        id="card-1",
        tenant_id="t1",
        user_id="u1",
        project_id="p1",
        conversation_id=None,
        source_message_id=None,
        title="验证任务",
        project_summary="",
        core_judgment="",
        biggest_uncertainty="",
        target_customer="",
        failure_reason="",
        actions=[
            {
                "node_id": "n1",
                "parent_id": None,
                "node_type": "root",
                "branch_condition": "",
                "title": "起点",
                "objective": "确认起点",
                "steps": [],
                "success_metric": "形成判断",
                "grounded_on": "",
                "target": "",
                "baseline": "",
                "day_range": "1天",
                "status": "todo",
                "progress": 0,
                "evidence_count": 0,
                "evidence_target": 1,
                "evidence_grade": "C",
                "dependencies": [],
                "unlocks": [],
                "parallelizable": False,
                "priority_score": 50,
                "kill_if_failed": False,
                "evidence_items": [],
            },
            {
                "node_id": "n2",
                "parent_id": 1,
                "node_type": "evidence",
                "branch_condition": "",
                "title": "子节点",
                "objective": "确认子节点",
                "steps": [],
                "success_metric": "形成判断",
                "grounded_on": "",
                "target": "",
                "baseline": "",
                "day_range": "2天",
                "status": "todo",
                "progress": 0,
                "evidence_count": 0,
                "evidence_target": 1,
                "evidence_grade": "C",
                "dependencies": [],
                "unlocks": [],
                "parallelizable": False,
                "priority_score": 50,
                "kill_if_failed": False,
                "evidence_items": [],
            },
        ],
        decision_criteria={"continue_when": "继续", "adjust_when": "调整", "pause_when": "暂停"},
        result=None,
        actual_outcome="",
        learnings="",
        validated_at=None,
        node_refs=[],
        meta={},
        status="draft",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    result = ValidationCardOut.model_validate(card)

    assert result.actions[1].parent_id == "1"


def test_workbench_action_accepts_numeric_parent_id_from_stored_actions():
    action = WorkbenchAction(title="子节点", objective="", success_metric="形成判断", parent_id=1)

    assert action.parent_id == "1"
