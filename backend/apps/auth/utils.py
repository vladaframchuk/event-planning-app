from __future__ import annotations

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

EMAIL_CONFIRMATION_SALT = "apps.auth.email-confirmation"


class EmailConfirmationTokenError(ValueError):
    """Ошибка валидации токена подтверждения email."""


def make_email_confirmation_token(user_id: int) -> str:
    """
    Формирует подписанный токен с идентификатором пользователя для подтверждения email.

    Используем TimestampSigner, чтобы получить возможность ограничить время жизни токена.
    """
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    return signer.sign(str(user_id))


def verify_email_confirmation_token(token: str, max_age_seconds: int = 172_800) -> int:
    """
    Проверяет подпись и время жизни токена подтверждения email и возвращает user_id.

    При любой ошибке валидации возбуждает EmailConfirmationTokenError.
    """
    signer = TimestampSigner(salt=EMAIL_CONFIRMATION_SALT)
    try:
        raw_user_id = signer.unsign(token, max_age=max_age_seconds)
    except SignatureExpired as exc:
        raise EmailConfirmationTokenError("Срок действия токена истёк.") from exc
    except BadSignature as exc:
        raise EmailConfirmationTokenError("Некорректный токен подтверждения.") from exc

    try:
        return int(raw_user_id)
    except ValueError as exc:
        raise EmailConfirmationTokenError("Некорректный формат идентификатора пользователя.") from exc

