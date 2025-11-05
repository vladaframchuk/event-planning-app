from __future__ import annotations

import pytest

pytest.importorskip("reportlab", reason="Для генерации PDF требуется пакет reportlab.")
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.export.services import generate_event_pdf
from apps.tasks.models import Task, TaskList

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event(owner_email: str) -> tuple[Event, User]:
    owner = User.objects.create_user(email=owner_email, password="Password123")
    event = Event.objects.create(title="Sample Planning Event", owner=owner)
    Participant.objects.create(event=event, user=owner, role=Participant.Role.ORGANIZER)
    return event, owner


def test_generate_event_pdf_contains_event_title() -> None:
    event, owner = _create_event("owner@pdf.test")
    task_list = TaskList.objects.create(event=event, title="Основной список", order=0)
    first_task = Task.objects.create(
        list=task_list,
        title="Подготовить площадку",
        status=Task.Status.DOING,
        order=0,
    )
    second_task = Task.objects.create(
        list=task_list,
        title="Настроить оборудование",
        status=Task.Status.TODO,
        order=1,
    )
    second_task.depends_on.add(first_task)

    pdf_bytes = generate_event_pdf(event.id)

    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 0
    assert event.title.encode("utf-8") in pdf_bytes


def test_event_pdf_export_view_returns_pdf_response() -> None:
    event, owner = _create_event("owner@api.test")
    task_list = TaskList.objects.create(event=event, title="Главный", order=0)
    Task.objects.create(list=task_list, title="Составить программу", order=0)

    client = _auth_client(owner)
    response = client.get(
        f"/api/events/{event.id}/export/pdf",
        HTTP_ACCEPT="application/pdf",
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert (
        response["Content-Disposition"]
        == f'attachment; filename="event_{event.id}_plan.pdf"'
    )
    assert event.title.encode("utf-8") in response.content


def test_event_pdf_export_view_denies_non_participant() -> None:
    event, owner = _create_event("owner@forbidden.test")
    outsider = User.objects.create_user(
        email="outsider@test.dev", password="Password123"
    )

    client = _auth_client(outsider)
    response = client.get(f"/api/events/{event.id}/export/pdf")

    assert response.status_code == 403
