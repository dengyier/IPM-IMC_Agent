"""认证接口 schema。"""

from datetime import datetime

from pydantic import BaseModel, Field


class SendSmsCodeRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=32)


class SendSmsCodeResponse(BaseModel):
    sent: bool
    expires_in_seconds: int
    resend_after_seconds: int


class SmsLoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    code: str = Field(min_length=4, max_length=8)


class AuthUserOut(BaseModel):
    id: str
    phone: str
    display_name: str
    role: str
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuthLoginResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_at: datetime
    user: AuthUserOut
