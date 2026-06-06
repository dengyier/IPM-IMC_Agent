"""手机号验证码登录接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.core.config import Settings
from app.db.session import get_db
from app.schemas.auth import (
    AuthProfileUpdate,
    AuthLoginResponse,
    AuthUserOut,
    SendSmsCodeRequest,
    SendSmsCodeResponse,
    SmsLoginRequest,
)
from app.services.auth_service import AuthService, user_public_view
from app.api.deps import get_app_settings, token_from_header as _token_from_header

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/sms/send", response_model=SendSmsCodeResponse)
def send_sms_code(
    payload: SendSmsCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> SendSmsCodeResponse:
    service = AuthService(settings)
    service.send_login_code(db, payload.phone, request.client.host if request.client else None)
    return SendSmsCodeResponse(
        sent=True,
        expires_in_seconds=settings.sms_code_ttl_seconds,
        resend_after_seconds=settings.sms_code_send_interval_seconds,
    )


@router.post("/login/sms", response_model=AuthLoginResponse)
def login_with_sms(
    payload: SmsLoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthLoginResponse:
    service = AuthService(settings)
    user, token, expires_at = service.login_with_code(db, payload.phone, payload.code)
    return AuthLoginResponse(
        token=token, expires_at=expires_at, user=AuthUserOut(**user_public_view(db, user))
    )


@router.get("/me", response_model=AuthUserOut)
def me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthUserOut:
    token = _token_from_header(authorization)
    user = AuthService(settings).get_user_by_token(db, token)
    if not user:
        raise AppError("UNAUTHORIZED", "登录状态已过期，请重新登录", 401)
    return AuthUserOut(**user_public_view(db, user))


@router.patch("/me", response_model=AuthUserOut)
def update_me(
    payload: AuthProfileUpdate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthUserOut:
    token = _token_from_header(authorization)
    user = AuthService(settings).get_user_by_token(db, token)
    if not user:
        raise AppError("UNAUTHORIZED", "登录状态已过期，请重新登录", 401)

    display_name = payload.display_name.strip()
    if not display_name:
        raise AppError("INVALID_DISPLAY_NAME", "用户名称不能为空", 400)
    user.display_name = display_name
    db.commit()
    db.refresh(user)
    return AuthUserOut(**user_public_view(db, user))


@router.post("/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> None:
    token = _token_from_header(authorization)
    AuthService(settings).logout(db, token)
