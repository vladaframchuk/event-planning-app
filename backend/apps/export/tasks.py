from __future__ import annotations

from celery import shared_task
from django.core.mail import EmailMessage

from apps.export.services import generate_event_pdf


@shared_task(bind=True, name="apps.export.generate_event_pdf")
def generate_event_pdf_task(self, event_id: int, user_email: str) -> str:
    """Формирует PDF и отправляет его пользователю по email."""
    pdf_bytes = generate_event_pdf(event_id)
    filename = f"event_{event_id}_plan.pdf"

    message = EmailMessage(
        subject=f"План события #{event_id}",
        body="Во вложении PDF-отчёт по задачам события.",
        to=[user_email],
    )
    message.attach(filename, pdf_bytes, "application/pdf")
    message.send(fail_silently=False)

    return f"sent:{filename}"
