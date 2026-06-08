"""手机号验证码登录服务。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import re
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.core.config import Settings
from app.db.base import APP_TIMEZONE, app_now
from app.db.models.auth import AuthSession, AuthUser, SmsVerificationCode
from app.db.models.tenant import Tenant


PHONE_RE = re.compile(r"^\+?\d{6,20}$")

# 平台级角色
ROLE_SUPER_ADMIN = "super_admin"
ROLE_MEMBER = "member"

# 租户内身份
USER_TYPE_ENTERPRISE_MANAGER = "enterprise_manager"
USER_TYPE_ENTERPRISE_STAFF = "enterprise_staff"
USER_TYPE_INDIVIDUAL = "individual"

# 可操作人工审核台的身份（超管恒可）
REVIEWER_USER_TYPES = {USER_TYPE_ENTERPRISE_MANAGER, USER_TYPE_INDIVIDUAL}

# 超级管理员手机号（normalize 后为 +8615520810759）
SUPER_ADMIN_PHONE = "+8615520810759"
LEGACY_DEFAULT_DISPLAY_NAMES = {"张晓明", "天机用户"}


def default_display_name(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    last4 = digits[-4:] if len(digits) >= 4 else "用户"
    return f"天机{last4}"


def can_review(user: AuthUser) -> bool:
    return user.role == ROLE_SUPER_ADMIN or user.user_type in REVIEWER_USER_TYPES


def user_public_view(db: Session, user: AuthUser) -> dict:
    """构造前端可用的用户视图：含租户名与计算出的权限布尔。"""
    tenant_name = None
    if user.tenant_id:
        tenant = db.get(Tenant, user.tenant_id)
        tenant_name = tenant.name if tenant else None
    is_super = user.role == ROLE_SUPER_ADMIN
    return {
        "id": user.id,
        "phone": user.phone,
        "display_name": user.display_name,
        "role": user.role,
        "user_type": user.user_type,
        "tenant_id": user.tenant_id,
        "tenant_name": tenant_name,
        "is_super_admin": is_super,
        "can_review": can_review(user),
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


@dataclass(frozen=True)
class SmsSendResult:
    request_id: str | None = None
    error: str | None = None


class TencentSmsClient:
    """腾讯云短信 SendSms API 的轻量客户端，避免额外 SDK 依赖。"""

    endpoint = "sms.tencentcloudapi.com"
    service = "sms"
    version = "2021-01-11"
    action = "SendSms"

    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return all(
            [
                self.settings.tencentcloud_secret_id,
                self.settings.tencentcloud_secret_key,
                self.settings.tencentsms_sdk_app_id,
                self.settings.tencentsms_sign_name,
                self.settings.tencentsms_template_id,
            ]
        )

    def send_code(self, phone: str, code: str) -> SmsSendResult:
        if not self.enabled:
            return SmsSendResult(error="短信配置未启用")

        params = [code]
        expected = max(1, int(self.settings.tencentsms_template_param_count))
        if expected != 1:
            params = [code][:expected]

        payload = {
            "PhoneNumberSet": [phone],
            "SmsSdkAppId": self.settings.tencentsms_sdk_app_id,
            "SignName": self.settings.tencentsms_sign_name,
            "TemplateId": self.settings.tencentsms_template_id,
            "TemplateParamSet": params,
        }
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        timestamp = int(time.time())
        date = datetime.fromtimestamp(timestamp, UTC).strftime("%Y-%m-%d")
        headers = self._headers(body, timestamp, date)

        req = urlrequest.Request(
            f"https://{self.endpoint}",
            data=body.encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlrequest.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed Tencent endpoint
                data = json.loads(resp.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return SmsSendResult(error=detail or str(exc))
        except (URLError, TimeoutError) as exc:
            return SmsSendResult(error=str(exc))

        response = data.get("Response") or {}
        if response.get("Error"):
            err = response["Error"]
            return SmsSendResult(
                request_id=response.get("RequestId"),
                error=f"{err.get('Code', 'SMS_ERROR')}: {err.get('Message', '')}",
            )
        send_status = (response.get("SendStatusSet") or [{}])[0]
        if send_status.get("Code") and send_status.get("Code") != "Ok":
            return SmsSendResult(
                request_id=response.get("RequestId"),
                error=f"{send_status.get('Code')}: {send_status.get('Message', '')}",
            )
        return SmsSendResult(request_id=response.get("RequestId"))

    def _headers(self, payload: str, timestamp: int, date: str) -> dict[str, str]:
        secret_id = self.settings.tencentcloud_secret_id or ""
        secret_key = self.settings.tencentcloud_secret_key or ""
        region = self.settings.tencentcloud_region
        canonical_request = "\n".join(
            [
                "POST",
                "/",
                "",
                "content-type:application/json; charset=utf-8",
                f"host:{self.endpoint}",
                "",
                "content-type;host",
                hashlib.sha256(payload.encode("utf-8")).hexdigest(),
            ]
        )
        credential_scope = f"{date}/{self.service}/tc3_request"
        string_to_sign = "\n".join(
            [
                "TC3-HMAC-SHA256",
                str(timestamp),
                credential_scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )
        secret_date = hmac.new(
            ("TC3" + secret_key).encode("utf-8"), date.encode("utf-8"), hashlib.sha256
        ).digest()
        secret_service = hmac.new(secret_date, self.service.encode("utf-8"), hashlib.sha256).digest()
        secret_signing = hmac.new(secret_service, b"tc3_request", hashlib.sha256).digest()
        signature = hmac.new(
            secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        authorization = (
            "TC3-HMAC-SHA256 "
            f"Credential={secret_id}/{credential_scope}, "
            "SignedHeaders=content-type;host, "
            f"Signature={signature}"
        )
        return {
            "Authorization": authorization,
            "Content-Type": "application/json; charset=utf-8",
            "Host": self.endpoint,
            "X-TC-Action": self.action,
            "X-TC-Region": region,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": self.version,
        }


class AuthService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.sms_client = TencentSmsClient(settings)

    def send_login_code(self, db: Session, phone_input: str, ip_address: str | None) -> None:
        phone = normalize_phone(phone_input)
        now = app_now()
        latest = db.execute(
            select(SmsVerificationCode)
            .where(SmsVerificationCode.phone == phone)
            .order_by(desc(SmsVerificationCode.created_at))
            .limit(1)
        ).scalar_one_or_none()
        if latest and (now - as_app_naive(latest.created_at)).total_seconds() < self.settings.sms_code_send_interval_seconds:
            raise AppError("SMS_TOO_FREQUENT", "验证码发送太频繁，请稍后再试", 429)

        code = f"{random.SystemRandom().randint(0, 999999):06d}"
        expires_at = now + timedelta(seconds=self.settings.sms_code_ttl_seconds)
        record = SmsVerificationCode(
            phone=phone,
            purpose="login",
            code_hash=hash_code(phone, code),
            expires_at=expires_at,
            ip_address=ip_address,
        )
        result = self.sms_client.send_code(phone, code)
        record.provider_request_id = result.request_id
        record.error_message = result.error
        db.add(record)
        db.commit()
        if result.error:
            raise AppError("SMS_SEND_FAILED", f"验证码发送失败：{result.error}", 502)

    def login_with_code(self, db: Session, phone_input: str, code: str) -> tuple[AuthUser, str, datetime]:
        phone = normalize_phone(phone_input)
        now = app_now()
        record = db.execute(
            select(SmsVerificationCode)
            .where(
                SmsVerificationCode.phone == phone,
                SmsVerificationCode.purpose == "login",
                SmsVerificationCode.consumed_at.is_(None),
            )
            .order_by(desc(SmsVerificationCode.created_at))
            .limit(1)
        ).scalar_one_or_none()
        if not record:
            raise AppError("CODE_NOT_FOUND", "请先获取验证码", 400)
        if as_app_naive(record.expires_at) < now:
            raise AppError("CODE_EXPIRED", "验证码已过期，请重新获取", 400)
        if record.attempts >= self.settings.sms_code_max_attempts:
            raise AppError("CODE_LOCKED", "验证码错误次数过多，请重新获取", 400)

        record.attempts += 1
        if not secrets.compare_digest(record.code_hash, hash_code(phone, code.strip())):
            db.commit()
            raise AppError("CODE_INVALID", "验证码不正确", 400)

        record.consumed_at = now
        user = db.execute(select(AuthUser).where(AuthUser.phone == phone)).scalar_one_or_none()
        if not user:
            if phone == SUPER_ADMIN_PHONE:
                # 超级管理员：平台级，不属于任何业务租户
                user = AuthUser(
                    phone=phone,
                    display_name="超级管理员",
                    role=ROLE_SUPER_ADMIN,
                    user_type=USER_TYPE_INDIVIDUAL,
                    tenant_id=None,
                )
                db.add(user)
                db.flush()
            else:
                # 普通用户：首次登录自助开一个“独立个人”租户（C 方案中的个人自助）
                user = AuthUser(
                    phone=phone,
                    display_name=default_display_name(phone),
                    role=ROLE_MEMBER,
                    user_type=USER_TYPE_INDIVIDUAL,
                )
                db.add(user)
                db.flush()
                tenant = Tenant(
                    name=f"{phone} 的工作区",
                    type="individual",
                    owner_user_id=user.id,
                )
                db.add(tenant)
                db.flush()
                user.tenant_id = tenant.id
        elif phone == SUPER_ADMIN_PHONE and user.role != ROLE_SUPER_ADMIN:
            # 幂等纠正：确保超管手机号始终是 super_admin
            user.role = ROLE_SUPER_ADMIN
            user.tenant_id = None
        elif user.role != ROLE_SUPER_ADMIN:
            digits = re.sub(r"\D", "", phone)
            generated_names = LEGACY_DEFAULT_DISPLAY_NAMES | {f"用户{digits[-4:]}"}
            if user.display_name in generated_names:
                user.display_name = default_display_name(phone)
        user.last_login_at = now
        token = secrets.token_urlsafe(32)
        expires_at = now + timedelta(days=self.settings.auth_session_ttl_days)
        db.add(
            AuthSession(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=expires_at,
            )
        )
        db.commit()
        db.refresh(user)
        return user, token, expires_at

    def get_user_by_token(self, db: Session, token: str) -> AuthUser | None:
        token_hash = hash_token(token)
        now = app_now()
        session = db.execute(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        ).scalar_one_or_none()
        if not session:
            return None
        return db.get(AuthUser, session.user_id)

    def logout(self, db: Session, token: str) -> None:
        session = db.execute(
            select(AuthSession).where(AuthSession.token_hash == hash_token(token))
        ).scalar_one_or_none()
        if session and not session.revoked_at:
            session.revoked_at = app_now()
            db.commit()


def normalize_phone(phone: str) -> str:
    raw = re.sub(r"[\s-]", "", phone.strip())
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if raw.startswith("1") and len(raw) == 11:
        raw = "+86" + raw
    if not raw.startswith("+"):
        raw = "+" + raw
    if not PHONE_RE.match(raw):
        raise AppError("PHONE_INVALID", "手机号格式不正确", 400)
    return raw


def hash_code(phone: str, code: str) -> str:
    raw = f"{phone}:{code.strip()}".encode("utf-8")
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).decode("ascii")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def as_app_naive(value: datetime) -> datetime:
    if value.tzinfo:
        return value.astimezone(APP_TIMEZONE).replace(tzinfo=None)
    return value
