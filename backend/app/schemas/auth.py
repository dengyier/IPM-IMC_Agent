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
    user_type: str = "individual"
    tenant_id: str | None = None
    tenant_name: str | None = None
    is_super_admin: bool = False
    can_review: bool = False
    created_at: datetime | None = None
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuthProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class AuthLoginResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_at: datetime
    user: AuthUserOut
