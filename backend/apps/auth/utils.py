from __future__ import annotations

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils.translation import gettext as _

EMAIL_CONFIRMATION_SALT = "apps.auth.email-confirmation"


class EmailConfirmationTokenError(ValueError):
    """Ошибка обработки токена подтверждения email."""


def make_email_confirmation_token(user_id: int) -> str:
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    return signer.sign(str(user_id))


def verify_email_confirmation_token(token: str, max_age_seconds: int = 172_800) -> int:
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    try:
        raw_user_id = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailConfirmationTokenError(_("Срок действия токена подтверждения истёк.")) from exc
    except BadSignature as exc:
        raise EmailConfirmationTokenError(_("Токен подтверждения недействителен.")) from exc

    try:
        return int(raw_user_id)
    except ValueError as exc:
        raise EmailConfirmationTokenError(_("Некорректный формат токена подтверждения.")) from exc
