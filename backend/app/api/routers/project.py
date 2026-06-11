"""项目（Project）路由：当前用户/租户范围内的增删改查 + 状态流转。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, tenant_scope
from app.db.models import Project
from app.db.models.auth import AuthUser
from app.db.session import get_db
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.services import project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _to_out(db: Session, project: Project) -> ProjectOut:
    out = ProjectOut.model_validate(project)
    out.report_count = project_service.report_count(db, project.id)
    out.last_diagnosed_at = project_service.last_diagnosed_at(db, project.id)
    return out


@router.post("", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ProjectOut:
    project = Project(
        tenant_id=user.tenant_id,
        user_id=user.id,
        name=payload.name.strip(),
        industry=payload.industry,
        target_customer=payload.target_customer,
        current_problem=payload.current_problem,
        task_pack=payload.task_pack,
        status="idea",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_out(db, project)


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> list[ProjectOut]:
    tid = tenant_scope(user)
    query = db.query(Project)
    if tid is not None:
        query = query.filter(Project.tenant_id == tid)
    rows = query.order_by(Project.updated_at.desc()).all()
    return [_to_out(db, p) for p in rows]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ProjectOut:
    project = project_service.get_owned_project(db, project_id, user)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return _to_out(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> ProjectOut:
    project = project_service.get_owned_project(db, project_id, user)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if payload.status and payload.status != project.status:
        if not project_service.can_transition(project.status, payload.status):
            raise HTTPException(
                status_code=400,
                detail=f"非法的状态流转：{project.status} → {payload.status}",
            )
        project.status = payload.status
    if payload.name is not None:
        project.name = payload.name.strip() or project.name
    if payload.industry is not None:
        project.industry = payload.industry
    if payload.target_customer is not None:
        project.target_customer = payload.target_customer
    if payload.current_problem is not None:
        project.current_problem = payload.current_problem
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_out(db, project)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    project = project_service.get_owned_project(db, project_id, user)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    # 默认保留报告，仅解除关联（report.project_id 置空）
    from app.db.models import DiagnosisReport

    db.query(DiagnosisReport).filter(DiagnosisReport.project_id == project_id).update(
        {DiagnosisReport.project_id: None}, synchronize_session=False
    )
    db.delete(project)
    db.commit()
    from fastapi import Response

    return Response(status_code=204)
