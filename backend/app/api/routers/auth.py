"""手机号验证码登录接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.core.config import Settings
from app.db.session import get_db
from app.schemas.auth import (
    AuthLoginResponse,
    AuthUserOut,
    SendSmsCodeRequest,
    SendSmsCodeResponse,
    SmsLoginRequest,
)
from app.services.auth_service import AuthService
from app.api.deps import get_app_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_from_header(authorization: str | None) -> str:
    if not authorization:
        raise AppError("UNAUTHORIZED", "请先登录", 401)
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError("UNAUTHORIZED", "登录状态无效", 401)
    return token


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
    return AuthLoginResponse(token=token, expires_at=expires_at, user=AuthUserOut.model_validate(user))


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
    return AuthUserOut.model_validate(user)


@router.post("/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> None:
    token = _token_from_header(authorization)
    AuthService(settings).logout(db, token)
