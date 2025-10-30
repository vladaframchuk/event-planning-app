from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList
from apps.tasks.cache_utils import cache_safe_clear

pytestmark = pytest.mark.django_db()

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    """Сбрасывает кеш между тестами, чтобы избежать ложных положительных результатов."""
    cache_safe_clear()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_owner(email: str) -> tuple[Event, User]:
    owner = User.objects.create_user(email=email, password="Password123")
    event = Event.objects.create(owner=owner, title="Тестовое событие")
    Participant.objects.get_or_create(
        event=event,
        user=owner,
        defaults={"role": Participant.Role.ORGANIZER},
    )
    return event, owner


def test_progress_returns_counts_and_percent() -> None:
    event, owner = _create_event_with_owner("progress@example.com")
    list_main = TaskList.objects.create(event=event, title="Подготовка", order=1)
    list_day = TaskList.objects.create(event=event, title="День X", order=0)

    Task.objects.create(list=list_main, title="Собрать материалы", status=Task.Status.TODO)
    Task.objects.create(list=list_main, title="Согласовать площадку", status=Task.Status.DOING)
    Task.objects.create(list=list_main, title="Подготовить презентацию", status=Task.Status.DONE)
    Task.objects.create(list=list_day, title="Запустить стрим", status=Task.Status.TODO)
    Task.objects.create(list=list_day, title="Проверить звук", status=Task.Status.DONE)

    client = _auth_client(owner)
    response = client.get(f"/api/events/{event.id}/progress")

    assert response.status_code == 200
    payload = response.json()

    assert payload["event_id"] == event.id
    assert payload["total_tasks"] == 5
    assert payload["counts"] == {"todo": 2, "doing": 1, "done": 2}
    assert payload["percent_done"] == 40.0
    assert payload["by_list"][0]["list_id"] == list_day.id
    assert payload["by_list"][0]["total"] == 2
    assert payload["by_list"][1]["list_id"] == list_main.id
    assert payload["by_list"][1]["done"] == 1
    assert payload["ttl_seconds"] == 30
    assert payload["generated_at"].endswith("Z")


def test_progress_cached_and_invalidated_on_task_change() -> None:
    event, owner = _create_event_with_owner("cache@example.com")
    task_list = TaskList.objects.create(event=event, title="Список", order=0)
    task = Task.objects.create(list=task_list, title="Задача", status=Task.Status.TODO)

    client = _auth_client(owner)
    first_payload = client.get(f"/api/events/{event.id}/progress").json()
    second_payload = client.get(f"/api/events/{event.id}/progress").json()

    assert first_payload["generated_at"] == second_payload["generated_at"]

    task.status = Task.Status.DONE
    task.save()

    third_payload = client.get(f"/api/events/{event.id}/progress").json()
    assert third_payload["generated_at"] != first_payload["generated_at"]
    assert third_payload["counts"]["done"] == 1


def test_only_participant_or_owner_can_access() -> None:
    event, owner = _create_event_with_owner("owner-access@example.com")
    outsider = User.objects.create_user(email="outsider@example.com", password="Password123")

    owner_client = _auth_client(owner)
    outsider_client = _auth_client(outsider)

    owner_response = owner_client.get(f"/api/events/{event.id}/progress")
    assert owner_response.status_code == 200

    outsider_response = outsider_client.get(f"/api/events/{event.id}/progress")
    assert outsider_response.status_code == 403


def test_zero_tasks_percent_is_zero() -> None:
    event, owner = _create_event_with_owner("empty@example.com")
    TaskList.objects.create(event=event, title="Пустой список", order=0)

    client = _auth_client(owner)
    payload = client.get(f"/api/events/{event.id}/progress").json()

    assert payload["total_tasks"] == 0
    assert payload["counts"] == {"todo": 0, "doing": 0, "done": 0}
    assert payload["percent_done"] == 0.0


def test_by_list_structure_sorted_by_order() -> None:
    event, owner = _create_event_with_owner("order@example.com")
    list_first = TaskList.objects.create(event=event, title="Первая", order=0)
    list_second = TaskList.objects.create(event=event, title="Вторая", order=5)
    list_third = TaskList.objects.create(event=event, title="Третья", order=1)

    Task.objects.create(list=list_second, title="Задача 2", status=Task.Status.DONE)
    Task.objects.create(list=list_third, title="Задача 3", status=Task.Status.DOING)

    client = _auth_client(owner)
    payload = client.get(f"/api/events/{event.id}/progress").json()

    list_ids = [item["list_id"] for item in payload["by_list"]]
    assert list_ids == [list_first.id, list_third.id, list_second.id]
