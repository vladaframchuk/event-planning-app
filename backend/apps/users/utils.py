from __future__ import annotations

import json
from typing import Tuple

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

EMAIL_CHANGE_SALT = "apps.users.email-change"
EMAIL_CHANGE_TTL_SECONDS = 48 * 60 * 60


class EmailChangeTokenError(ValueError):
    """Raised when an email change token is invalid or expired."""


def make_email_change_token(user_id: int, new_email: str) -> str:
    payload = json.dumps({"uid": user_id, "email": new_email}, separators=(",", ":"))
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    return signer.sign(payload)


def verify_email_change_token(token: str, max_age_seconds: int = EMAIL_CHANGE_TTL_SECONDS) -> Tuple[int, str]:
    signer = TimestampSigner(salt=EMAIL_CHANGE_SALT)
    try:
        raw_payload = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailChangeTokenError("Token has expired.") from exc
    except BadSignature as exc:
        raise EmailChangeTokenError("Token signature is invalid.") from exc

    try:
        data = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise EmailChangeTokenError("Token payload is malformed.") from exc

    if not isinstance(data, dict):
        raise EmailChangeTokenError("Token payload structure is invalid.")

    user_id = data.get("uid")
    new_email = data.get("email")

    if not isinstance(user_id, int) or not isinstance(new_email, str) or not new_email:
        raise EmailChangeTokenError("Token payload is incomplete.")

    return user_id, new_email
