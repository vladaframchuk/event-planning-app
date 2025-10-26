from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail

from apps.users.models import User

from .utils import make_email_confirmation_token


def _build_confirmation_link(token: str) -> str:
    """Формирует абсолютную ссылку для подтверждения email."""
    base_url = settings.SITE_URL.rstrip("/")
    return f"{base_url}/api/auth/confirm?token={token}"


def send_confirmation_email(user: User) -> None:
    """
    Отправляет пользователю письмо со ссылкой на подтверждение email.

    Письмо попадает в консольный backend, поэтому в тестах его можно перехватить.
    """
    if user.pk is None:
        raise ValueError("Невозможно отправить письмо без сохранённого пользователя.")

    token = make_email_confirmation_token(user.pk)
    confirmation_link = _build_confirmation_link(token)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@example.com")

    send_mail(
        subject="Подтверждение регистрации",
        message=f"Для подтверждения регистрации перейдите по ссылке: {confirmation_link}",
        from_email=from_email,
        recipient_list=[user.email],
    )

