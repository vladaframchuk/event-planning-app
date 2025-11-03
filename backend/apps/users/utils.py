from __future__ import annotations

import base64
import binascii
import json

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils.translation import gettext as _

EMAIL_CHANGE_SALT = "apps.users.email-change"
EMAIL_CHANGE_TTL_SECONDS = 48 * 60 * 60


class EmailChangeTokenError(ValueError):
    """Ошибка обработки токена подтверждения email."""


def make_email_change_token(user_id: int, new_email: str) -> str:
    payload = json.dumps({"uid": user_id, "email": new_email}, separators=(",", ":")).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii")
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    return signer.sign(encoded_payload)


def verify_email_change_token(token: str, max_age_seconds: int = EMAIL_CHANGE_TTL_SECONDS) -> tuple[int, str]:
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    try:
        raw_payload = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailChangeTokenError(_("Срок действия ссылки для подтверждения email истёк.")) from exc
    except BadSignature as exc:
        raise EmailChangeTokenError(_("Недействительная подпись подтверждения email.")) from exc

    try:
        decoded = base64.urlsafe_b64decode(raw_payload.encode("ascii"))
    except binascii.Error as exc:
        raise EmailChangeTokenError(_("Некорректный формат токена подтверждения email.")) from exc

    try:
        data = json.loads(decoded)
    except (TypeError, json.JSONDecodeError) as exc:
        raise EmailChangeTokenError(_("Некорректный формат токена подтверждения email.")) from exc

    if not isinstance(data, dict):
        raise EmailChangeTokenError(_("Некорректная структура токена подтверждения email."))

    user_id = data.get("uid")
    new_email = data.get("email")

    if not isinstance(user_id, int) or not isinstance(new_email, str) or not new_email:
        raise EmailChangeTokenError(_("Токен подтверждения email не содержит ожидаемых данных."))

    return user_id, new_email
