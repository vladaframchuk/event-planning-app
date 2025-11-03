from __future__ import annotations

import json
import base64
import binascii
from typing import Tuple

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

EMAIL_CHANGE_SALT = "apps.users.email-change"
EMAIL_CHANGE_TTL_SECONDS = 48 * 60 * 60


class EmailChangeTokenError(ValueError):
    """Исключение для ошибок при подтверждении смены email."""


def make_email_change_token(user_id: int, new_email: str) -> str:
    payload = json.dumps({"uid": user_id, "email": new_email}, separators=(",", ":")).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii")
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    return signer.sign(encoded_payload)


def verify_email_change_token(token: str, max_age_seconds: int = EMAIL_CHANGE_TTL_SECONDS) -> Tuple[int, str]:
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    try:
        raw_payload = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailChangeTokenError("Срок действия токена смены email истёк.") from exc
    except BadSignature as exc:
        raise EmailChangeTokenError("Подпись токена смены email недействительна.") from exc

    try:
        decoded = base64.urlsafe_b64decode(raw_payload.encode("ascii"))
    except binascii.Error as exc:
        raise EmailChangeTokenError("Структура токена повреждена.") from exc

    try:
        data = json.loads(decoded)
    except (TypeError, json.JSONDecodeError) as exc:
        raise EmailChangeTokenError("Структура токена повреждена.") from exc

    if not isinstance(data, dict):
        raise EmailChangeTokenError("Структура данных токена недействительна.")

    user_id = data.get("uid")
    new_email = data.get("email")

    if not isinstance(user_id, int) or not isinstance(new_email, str) or not new_email:
        raise EmailChangeTokenError("В токене отсутствует идентификатор пользователя или email.")

    return user_id, new_email
