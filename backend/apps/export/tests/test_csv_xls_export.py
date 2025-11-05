from __future__ import annotations

import codecs
from datetime import timedelta
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.polls.models import Poll, PollOption, Vote
from apps.tasks.models import Task, TaskList

openpyxl = pytest.importorskip(
    "openpyxl", reason="openpyxl требуется для проверки XLS-экспорта."
)

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    """Возвращает аутентифицированного клиента DRF."""

    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_data() -> tuple[Event, User, Task, Poll, PollOption]:
    """Создаёт событие с задачами и опросами для проверки экспорта."""

    owner = User.objects.create_user(email="owner@export.test", password="Password123")
    event = Event.objects.create(title="Экспортное событие", owner=owner)
    organizer = Participant.objects.create(
        event=event, user=owner, role=Participant.Role.ORGANIZER
    )

    task_list = TaskList.objects.create(event=event, title="Список задач", order=0)
    start_at = timezone.now()
    due_at = start_at + timedelta(days=2)
    task = Task.objects.create(
        list=task_list,
        title="Подготовить презентацию",
        status=Task.Status.DOING,
        assignee=organizer,
        start_at=start_at,
        due_at=due_at,
        order=0,
    )

    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Во сколько встречаемся?",
        multiple=False,
    )
    poll_option = PollOption.objects.create(poll=poll, label="18:00")
    Vote.objects.create(poll=poll, option=poll_option, user=owner)

    return event, owner, task, poll, poll_option


def test_event_export_csv_returns_utf8_bom_and_contains_data() -> None:
    event, owner, task, poll, poll_option = _create_event_with_data()

    client = _auth_client(owner)
    response = client.get(f"/api/events/{event.id}/export/csv")

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert (
        response["Content-Disposition"]
        == f'attachment; filename="event_{event.id}_plan.csv"'
    )

    content = response.content
    assert content.startswith(codecs.BOM_UTF8)
    decoded = content.decode("utf-8-sig")
    assert task.title in decoded
    assert poll.question in decoded
    assert poll_option.label and poll_option.label in decoded


def test_event_export_xls_loads_with_openpyxl_and_contains_data() -> None:
    event, owner, task, poll, poll_option = _create_event_with_data()

    client = _auth_client(owner)
    response = client.get(f"/api/events/{event.id}/export/xls")

    assert response.status_code == 200
    assert (
        response["Content-Type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert (
        response["Content-Disposition"]
        == f'attachment; filename="event_{event.id}_plan.xlsx"'
    )

    workbook = openpyxl.load_workbook(BytesIO(response.content))
    assert "Задачи" in workbook.sheetnames
    assert "Опросы" in workbook.sheetnames

    tasks_sheet = workbook["Задачи"]
    task_titles = [cell.value for cell in tasks_sheet["A"][1:]]
    assert task.title in task_titles

    polls_sheet = workbook["Опросы"]
    poll_questions = [cell.value for cell in polls_sheet["A"][1:]]
    assert poll.question in poll_questions
    option_labels = [cell.value for cell in polls_sheet["B"][1:]]
    assert poll_option.label in option_labels


def test_event_export_csv_forbidden_for_non_participant() -> None:
    event, owner, *_ = _create_event_with_data()
    outsider = User.objects.create_user(
        email="outsider@export.test", password="Password123"
    )

    client = _auth_client(outsider)
    response = client.get(f"/api/events/{event.id}/export/csv")

    assert response.status_code == 403
