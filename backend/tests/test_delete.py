from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.tasks.cache_utils import cache_safe_clear
from apps.tasks.models import Task, TaskList

pytestmark = pytest.mark.django_db()

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    """Очищаем кеш между тестами, чтобы прогресс пересчитывался корректно."""
    cache_safe_clear()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_owner(email: str) -> tuple[Event, User]:
    owner = User.objects.create_user(email=email, password="Password123")
    event = Event.objects.create(owner=owner, title="Demo Event")
    Participant.objects.get_or_create(
        event=event,
        user=owner,
        defaults={"role": Participant.Role.ORGANIZER},
    )
    return event, owner


def test_owner_can_delete_task_and_orders_compact() -> None:
    event, owner = _create_event_with_owner("owner@example.com")
    task_list = TaskList.objects.create(event=event, title="Backlog", order=0)
    task_a = Task.objects.create(list=task_list, title="Task A", order=0)
    task_b = Task.objects.create(list=task_list, title="Task B", order=1)
    task_c = Task.objects.create(list=task_list, title="Task C", order=2)

    client = _auth_client(owner)
    response = client.delete(f"/api/tasks/{task_b.id}/")

    assert response.status_code == 204
    remaining = list(Task.objects.filter(list=task_list).order_by("order", "id"))
    assert [task.id for task in remaining] == [task_a.id, task_c.id]
    assert [task.order for task in remaining] == [0, 1]


def test_owner_can_delete_tasklist_cascade_and_tasklists_orders_compact() -> None:
    event, owner = _create_event_with_owner("list-owner@example.com")
    list_a = TaskList.objects.create(event=event, title="Ideas", order=0)
    list_b = TaskList.objects.create(event=event, title="Doing", order=1)
    list_c = TaskList.objects.create(event=event, title="Done", order=2)
    Task.objects.create(list=list_b, title="Middle 1", order=0)
    Task.objects.create(list=list_b, title="Middle 2", order=1)

    client = _auth_client(owner)
    response = client.delete(f"/api/tasklists/{list_b.id}/")

    assert response.status_code == 204
    assert not TaskList.objects.filter(id=list_b.id).exists()
    assert not Task.objects.filter(list_id=list_b.id).exists()

    remaining_lists = list(TaskList.objects.filter(event=event).order_by("order", "id"))
    assert [task_list.id for task_list in remaining_lists] == [list_a.id, list_c.id]
    assert [task_list.order for task_list in remaining_lists] == [0, 1]


def test_participant_cannot_delete_task_or_tasklist() -> None:
    event, owner = _create_event_with_owner("owner-delete@example.com")
    participant_user = User.objects.create_user(
        email="member@example.com", password="Password123"
    )
    Participant.objects.create(
        event=event, user=participant_user, role=Participant.Role.MEMBER
    )
    task_list = TaskList.objects.create(event=event, title="Roadmap", order=0)
    task = Task.objects.create(list=task_list, title="Protected", order=0)

    participant_client = _auth_client(participant_user)
    task_response = participant_client.delete(f"/api/tasks/{task.id}/")
    list_response = participant_client.delete(f"/api/tasklists/{task_list.id}/")

    assert task_response.status_code == 403
    assert list_response.status_code == 403
    assert Task.objects.filter(id=task.id).exists()
    assert TaskList.objects.filter(id=task_list.id).exists()


def test_delete_triggers_progress_invalidation() -> None:
    event, owner = _create_event_with_owner("progress-owner@example.com")
    task_list = TaskList.objects.create(event=event, title="Main", order=0)
    task = Task.objects.create(list=task_list, title="To remove", order=0)

    client = _auth_client(owner)
    first_payload = client.get(f"/api/events/{event.id}/progress").json()
    cached_payload = client.get(f"/api/events/{event.id}/progress").json()
    assert cached_payload["generated_at"] == first_payload["generated_at"]

    delete_response = client.delete(f"/api/tasks/{task.id}/")
    assert delete_response.status_code == 204

    refreshed_payload = client.get(f"/api/events/{event.id}/progress").json()
    assert refreshed_payload["generated_at"] != first_payload["generated_at"]


def test_delete_nonexistent_returns_404() -> None:
    event, owner = _create_event_with_owner("missing-owner@example.com")
    TaskList.objects.create(event=event, title="Inbox", order=0)

    client = _auth_client(owner)
    missing_task_response = client.delete("/api/tasks/999999/")
    missing_list_response = client.delete("/api/tasklists/888888/")

    assert missing_task_response.status_code == 404
    assert missing_list_response.status_code == 404
