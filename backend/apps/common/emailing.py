from __future__ import annotations

from typing import Any, Iterable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags


def _resolve_template_path(template: str) -> str:
    """Возвращает полный путь к шаблону email, дополняя префикс при необходимости."""
    if "/" in template:
        return template
    return f"email/{template}"


def send_templated_email(
    to: Iterable[str],
    subject: str,
    template: str,
    context: dict[str, Any] | None = None,
) -> None:
    """Отправляет письмо с HTML-шаблоном и текстовой версией."""
    recipients = [address for address in to if address]
    if not recipients:
        return

    template_path = _resolve_template_path(template)
    render_context = context or {}
    html_body = render_to_string(template_path, render_context)
    text_body = strip_tags(html_body)

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@example.com")

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email,
        to=recipients,
    )
    email.attach_alternative(html_body, "text/html")
    email.send()
