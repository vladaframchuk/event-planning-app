from __future__ import annotations

from celery import shared_task

from apps.users.models import User


@shared_task
def send_confirmation_email_async(user_id: int) -> str:
    """Отправляет письмо с подтверждением регистрации через Celery."""
    from .emails import send_confirmation_email

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return "user_missing"

    send_confirmation_email(user)
    return "sent"
