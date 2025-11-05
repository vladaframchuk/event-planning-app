from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
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


def test_owner_can_reorder_tasklists_and_orders_are_compact_0_based() -> None:
    event, owner = _create_event_with_owner("owner@reorder.com")
    list_a = TaskList.objects.create(event=event, title="A", order=0)
    list_b = TaskList.objects.create(event=event, title="B", order=1)
    list_c = TaskList.objects.create(event=event, title="C", order=2)

    client = _auth_client(owner)
    response = client.post(
        f"/api/events/{event.id}/tasklists/reorder",
        data={"ordered_ids": [list_b.id, list_c.id, list_a.id]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "ok", "count": 3}

    ordered_lists = TaskList.objects.filter(event=event).order_by("order", "id")
    assert [task_list.id for task_list in ordered_lists] == [
        list_b.id,
        list_c.id,
        list_a.id,
    ]
    assert [task_list.order for task_list in ordered_lists] == [0, 1, 2]


def test_owner_can_reorder_tasks_within_list_and_orders_are_compact() -> None:
    event, owner = _create_event_with_owner("owner@tasks.com")
    task_list = TaskList.objects.create(event=event, title="Main")
    task_a = Task.objects.create(list=task_list, title="A", order=0)
    task_b = Task.objects.create(list=task_list, title="B", order=1)
    task_c = Task.objects.create(list=task_list, title="C", order=2)

    client = _auth_client(owner)
    response = client.post(
        f"/api/tasklists/{task_list.id}/tasks/reorder",
        data={"ordered_ids": [task_c.id, task_a.id, task_b.id]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "ok", "count": 3}

    ordered_tasks = Task.objects.filter(list=task_list).order_by("order", "id")
    assert [task.id for task in ordered_tasks] == [task_c.id, task_a.id, task_b.id]
    assert [task.order for task in ordered_tasks] == [0, 1, 2]


def test_reorder_tasks_accepts_empty_list() -> None:
    event, owner = _create_event_with_owner("owner@empty-tasks.com")
    task_list = TaskList.objects.create(event=event, title="Main")

    client = _auth_client(owner)
    response = client.post(
        f"/api/tasklists/{task_list.id}/tasks/reorder",
        data={"ordered_ids": []},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "ok", "count": 0}


def test_participant_cannot_reorder_returns_403() -> None:
    event, owner = _create_event_with_owner("owner@403.com")
    member = User.objects.create_user(email="member@403.com", password="Password123")
    Participant.objects.create(event=event, user=member, role=Participant.Role.MEMBER)
    list_a = TaskList.objects.create(event=event, title="A", order=0)
    TaskList.objects.create(event=event, title="B", order=1)

    member_client = _auth_client(member)

    response = member_client.post(
        f"/api/events/{event.id}/tasklists/reorder",
        data={"ordered_ids": [list_a.id]},
        format="json",
    )

    assert response.status_code == 403


def test_reorder_tasklists_rejects_ids_not_belonging_to_event() -> None:
    event, owner = _create_event_with_owner("owner@invalid-lists.com")
    other_event, _ = _create_event_with_owner("other@invalid-lists.com")
    list_a = TaskList.objects.create(event=event, title="A", order=0)
    list_b = TaskList.objects.create(event=event, title="B", order=1)
    foreign_list = TaskList.objects.create(event=other_event, title="Foreign", order=0)

    client = _auth_client(owner)
    response = client.post(
        f"/api/events/{event.id}/tasklists/reorder",
        data={"ordered_ids": [list_b.id, list_a.id, foreign_list.id]},
        format="json",
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "invalid_ids"


def test_reorder_tasks_rejects_ids_not_belonging_to_list() -> None:
    event, owner = _create_event_with_owner("owner@invalid-tasks.com")
    other_event, _ = _create_event_with_owner("other@invalid-tasks.com")
    task_list = TaskList.objects.create(event=event, title="Main")
    other_list = TaskList.objects.create(event=other_event, title="Other")
    task_a = Task.objects.create(list=task_list, title="A", order=0)
    task_b = Task.objects.create(list=task_list, title="B", order=1)
    foreign_task = Task.objects.create(list=other_list, title="Foreign", order=0)

    client = _auth_client(owner)
    response = client.post(
        f"/api/tasklists/{task_list.id}/tasks/reorder",
        data={"ordered_ids": [task_b.id, task_a.id, foreign_task.id]},
        format="json",
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "invalid_ids"


def test_move_task_between_lists_via_two_calls_persists_positions() -> None:
    event, owner = _create_event_with_owner("owner@move.com")
    list_a = TaskList.objects.create(event=event, title="Source")
    list_b = TaskList.objects.create(event=event, title="Target")

    task_a = Task.objects.create(list=list_a, title="A", order=0)
    task_b = Task.objects.create(list=list_a, title="B", order=1)
    task_to_move = Task.objects.create(list=list_a, title="Move me", order=2)
    task_target_existing = Task.objects.create(list=list_b, title="Existing", order=0)

    task_to_move.list = list_b
    task_to_move.save(update_fields=["list"])

    client = _auth_client(owner)

    first_response = client.post(
        f"/api/tasklists/{list_a.id}/tasks/reorder",
        data={"ordered_ids": [task_a.id, task_b.id]},
        format="json",
    )
    assert first_response.status_code == 200

    second_response = client.post(
        f"/api/tasklists/{list_b.id}/tasks/reorder",
        data={"ordered_ids": [task_target_existing.id, task_to_move.id]},
        format="json",
    )
    assert second_response.status_code == 200

    remaining_tasks = Task.objects.filter(list=list_a).order_by("order", "id")
    assert [task.id for task in remaining_tasks] == [task_a.id, task_b.id]
    assert [task.order for task in remaining_tasks] == [0, 1]

    target_tasks = Task.objects.filter(list=list_b).order_by("order", "id")
    assert [task.id for task in target_tasks] == [
        task_target_existing.id,
        task_to_move.id,
    ]
    assert [task.order for task in target_tasks] == [0, 1]
