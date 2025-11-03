from __future__ import annotations

from django.conf import settings
from django.utils.translation import gettext as _

from apps.common.emailing import send_templated_email
from apps.users.models import User

from .utils import make_email_confirmation_token


def _build_confirmation_link(token: str) -> str:
    """Формирует ссылку на фронтенд для подтверждения регистрации."""
    base_url = settings.SITE_URL.rstrip("/")
    return f"{base_url}/auth/confirm?token={token}"


def send_confirmation_email(user: User) -> None:
    """Отправляет письмо с подтверждением регистрации новому пользователю."""
    if user.pk is None:
        raise ValueError("Нельзя отправлять письмо несохранённому пользователю.")

    token = make_email_confirmation_token(user.pk)
    confirmation_link = _build_confirmation_link(token)

    send_templated_email(
        to=[user.email],
        subject=_("Завершите регистрацию в Event Planner"),
        template="email/registration_confirm.html",
        context={
            "user": user,
            "confirmation_link": confirmation_link,
        },
    )
