from __future__ import annotations

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

EMAIL_CONFIRMATION_SALT = "apps.auth.email-confirmation"


class EmailConfirmationTokenError(ValueError):
    """Ошибка подтверждения email по токену."""


def make_email_confirmation_token(user_id: int) -> str:
    """Возвращает токен подтверждения email для указанного пользователя."""
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    return signer.sign(str(user_id))


def verify_email_confirmation_token(token: str, max_age_seconds: int = 172_800) -> int:
    """Проверяет валидность токена и возвращает идентификатор пользователя."""
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    try:
        raw_user_id = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailConfirmationTokenError("Токен подтверждения истёк.") from exc
    except BadSignature as exc:
        raise EmailConfirmationTokenError("Подпись токена недействительна.") from exc

    try:
        return int(raw_user_id)
    except ValueError as exc:
        raise EmailConfirmationTokenError("Неверный формат идентификатора пользователя.") from exc
