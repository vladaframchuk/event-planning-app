from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_owner(email: str) -> tuple[Event, User]:
    owner = User.objects.create_user(email=email, password="Password123")
    event = Event.objects.create(owner=owner, title="Demo Event")
    Participant.objects.get_or_create(
        event=event, user=owner, defaults={"role": Participant.Role.ORGANIZER}
    )
    return event, owner


def test_create_list_sets_incremental_order_within_event() -> None:
    event, owner = _create_event_with_owner("owner@example.com")
    other_event, other_owner = _create_event_with_owner("other@example.com")
    client = _auth_client(owner)
    other_client = _auth_client(other_owner)

    first_response = client.post(
        "/api/tasklists/",
        data={"event": event.id, "title": "Backlog"},
        format="json",
    )
    assert first_response.status_code == 201
    assert first_response.json()["order"] == 0

    second_response = client.post(
        "/api/tasklists/",
        data={"event": event.id, "title": "In Progress"},
        format="json",
    )
    assert second_response.status_code == 201
    assert second_response.json()["order"] == 1

    other_response = other_client.post(
        "/api/tasklists/",
        data={"event": other_event.id, "title": "Other"},
        format="json",
    )
    assert other_response.status_code == 201
    assert other_response.json()["order"] == 0


def test_create_task_sets_incremental_order_within_list() -> None:
    event, owner = _create_event_with_owner("task-owner@example.com")
    task_list = TaskList.objects.create(event=event, title="Backlog")
    client = _auth_client(owner)

    first_task = client.post(
        "/api/tasks/",
        data={"list": task_list.id, "title": "Task A"},
        format="json",
    )
    assert first_task.status_code == 201
    assert first_task.json()["order"] == 0

    second_task = client.post(
        "/api/tasks/",
        data={"list": task_list.id, "title": "Task B"},
        format="json",
    )
    assert second_task.status_code == 201
    assert second_task.json()["order"] == 1


def test_event_participant_can_read_but_cannot_modify_without_ownership() -> None:
    event, owner = _create_event_with_owner("board-owner@example.com")
    member = User.objects.create_user(
        email="member@example.com", password="Password123"
    )
    Participant.objects.create(event=event, user=member, role=Participant.Role.MEMBER)
    task_list = TaskList.objects.create(event=event, title="Ideas")
    Task.objects.create(list=task_list, title="Draft agenda")

    owner_client = _auth_client(owner)
    member_client = _auth_client(member)

    read_response = member_client.get("/api/tasklists/", {"event": event.id})
    assert read_response.status_code == 200
    assert read_response.json()[0]["id"] == task_list.id

    create_attempt = member_client.post(
        "/api/tasklists/",
        data={"event": event.id, "title": "Forbidden"},
        format="json",
    )
    assert create_attempt.status_code == 403

    list_payload = owner_client.post(
        "/api/tasklists/",
        data={"event": event.id, "title": "Planning"},
        format="json",
    )
    assert list_payload.status_code == 201
    created_list_id = list_payload.json()["id"]

    update_attempt = member_client.patch(
        f"/api/tasklists/{created_list_id}/",
        data={"title": "Hacked"},
        format="json",
    )
    assert update_attempt.status_code == 403

    task_create_attempt = member_client.post(
        "/api/tasks/",
        data={"list": task_list.id, "title": "Forbidden Task"},
        format="json",
    )
    assert task_create_attempt.status_code == 403


def test_task_due_date_validation() -> None:
    event, owner = _create_event_with_owner("validation@example.com")
    task_list = TaskList.objects.create(event=event, title="Validation")
    client = _auth_client(owner)

    start_at = timezone.now() + timedelta(days=2)
    due_at = start_at - timedelta(hours=1)

    response = client.post(
        "/api/tasks/",
        data={
            "list": task_list.id,
            "title": "Broken Timing",
            "start_at": start_at.isoformat(),
            "due_at": due_at.isoformat(),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "due_at" in response.json()


def test_depends_on_must_belong_to_same_event() -> None:
    event, owner = _create_event_with_owner("deps-owner@example.com")
    other_event, _ = _create_event_with_owner("deps-other@example.com")
    task_list = TaskList.objects.create(event=event, title="Main")
    other_list = TaskList.objects.create(event=other_event, title="Foreign")
    client = _auth_client(owner)

    local_task = Task.objects.create(list=task_list, title="Local dependency")
    foreign_task = Task.objects.create(list=other_list, title="Foreign dependency")

    response = client.post(
        "/api/tasks/",
        data={
            "list": task_list.id,
            "title": "Task with deps",
            "depends_on": [local_task.id, foreign_task.id],
        },
        format="json",
    )

    assert response.status_code == 400
    payload = response.json()
    assert "depends_on" in payload


def test_board_endpoint_returns_lists_and_tasks_sorted() -> None:
    event, owner = _create_event_with_owner("board@example.com")
    client = _auth_client(owner)

    list_a = TaskList.objects.create(event=event, title="Second", order=2)
    list_b = TaskList.objects.create(event=event, title="First", order=0)

    Task.objects.create(list=list_a, title="Late", order=5)
    Task.objects.create(list=list_a, title="Early", order=1)
    Task.objects.create(list=list_b, title="Another", order=2)
    Task.objects.create(list=list_b, title="First Task", order=0)

    response = client.get(f"/api/events/{event.id}/board")
    assert response.status_code == 200
    payload = response.json()

    assert payload["event"] == {"id": event.id, "title": event.title}
    assert payload["is_owner"] is True

    list_ids = [item["id"] for item in payload["lists"]]
    assert list_ids == [list_b.id, list_a.id]

    tasks_first = payload["lists"][0]["tasks"]
    assert [task["title"] for task in tasks_first] == ["First Task", "Another"]

    tasks_second = payload["lists"][1]["tasks"]
    assert [task["title"] for task in tasks_second] == ["Early", "Late"]
