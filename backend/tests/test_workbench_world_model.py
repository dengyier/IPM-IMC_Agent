"""验证工作台地球 Online 局面模型契约。"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Project, ValidationCard
from app.db.models.auth import AuthUser
from app.services import workbench_service


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _user(db):
    user = AuthUser(id="u1", phone="13800000000", tenant_id="t1", role="member")
    db.add(user)
    db.flush()
    return user


def test_workbench_summary_exposes_world_model_contract():
    db = _db()
    user = _user(db)
    project = Project(
        id="p1",
        tenant_id="t1",
        user_id="u1",
        name="GEO 服务产品化",
        current_problem="是否将 GEO 服务做成标准化产品",
        target_customer="OPC 创始人",
    )
    card = ValidationCard(
        id="card1",
        tenant_id="t1",
        user_id="u1",
        project_id=project.id,
        title="是否投入30万启动GEO服务产品化",
        actions=[
            {
                "node_id": "n1",
                "title": "验证痛点",
                "objective": "确认 OPC 创始人是否有 AI 搜索获客焦虑",
                "success_metric": "至少3条有效证据",
                "evidence_items": [{"text": "客户A确认痛点"}],
                "status": "running",
            }
        ],
        meta={"current_day": 2},
    )
    db.add_all([project, card])
    db.flush()

    summary = workbench_service.get_summary(db, user)

    assert summary.world_model is not None
    payload = summary.model_dump()
    assert payload["world_model"]["player_role"] == "OPC 创始人"
    assert payload["world_model"]["main_quest"] == "是否投入30万启动GEO服务产品化"
    assert payload["world_model"]["resource_gaps"]
    assert payload["world_model"]["active_rules"]
    assert payload["world_model"]["risk_signals"]
    assert payload["world_model"]["next_quests"]
