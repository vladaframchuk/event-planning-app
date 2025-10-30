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


def _make_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_owner(email: str) -> tuple[Event, User]:
    owner = User.objects.create_user(email=email, password="Password123")
    event = Event.objects.create(owner=owner, title="Test Event")
    Participant.objects.get_or_create(
        event=event,
        user=owner,
        defaults={"role": Participant.Role.ORGANIZER},
    )
    return event, owner


def test_owner_can_assign_and_unassign() -> None:
    event, owner = _create_event_with_owner("owner@example.com")
    task_list = TaskList.objects.create(event=event, title="List")
    task = Task.objects.create(list=task_list, title="Need assignee")

    assignee_user = User.objects.create_user(email="member@example.com", password="Password123")
    participant = Participant.objects.create(
        event=event,
        user=assignee_user,
        role=Participant.Role.MEMBER,
    )

    client = _make_client(owner)

    assign_response = client.post(
        f"/api/tasks/{task.id}/assign/",
        data={"assignee_participant_id": participant.id},
        format="json",
    )
    assert assign_response.status_code == 200
    assert assign_response.json() == {"message": "assigned"}

    task.refresh_from_db()
    assert task.assignee_id == participant.id

    unassign_response = client.post(
        f"/api/tasks/{task.id}/assign/",
        data={"assignee_participant_id": None},
        format="json",
    )
    assert unassign_response.status_code == 200
    assert unassign_response.json() == {"message": "assigned"}

    task.refresh_from_db()
    assert task.assignee_id is None


def test_participant_can_take_unassigned_task_but_not_when_already_assigned() -> None:
    event, owner = _create_event_with_owner("owner2@example.com")
    task_list = TaskList.objects.create(event=event, title="Todo")
    task = Task.objects.create(list=task_list, title="Shared task")

    member_user = User.objects.create_user(email="member@example.com", password="Password123")
    member_participant = Participant.objects.create(
        event=event,
        user=member_user,
        role=Participant.Role.MEMBER,
    )

    client = _make_client(member_user)

    take_response = client.post(f"/api/tasks/{task.id}/take/")
    assert take_response.status_code == 200
    payload = take_response.json()
    assert payload["message"] == "taken"
    assert payload["assignee"]["id"] == member_participant.id
    assert payload["assignee"]["user"]["email"] == member_user.email

    task.refresh_from_db()
    assert task.assignee_id == member_participant.id

    other_user = User.objects.create_user(email="other@example.com", password="Password123")
    Participant.objects.create(event=event, user=other_user, role=Participant.Role.MEMBER)

    other_client = _make_client(other_user)
    second_attempt = other_client.post(f"/api/tasks/{task.id}/take/")
    assert second_attempt.status_code == 409
    assert second_attempt.json() == {"code": "already_assigned"}


def test_assignee_can_change_status_own_task() -> None:
    event, owner = _create_event_with_owner("owner3@example.com")
    task_list = TaskList.objects.create(event=event, title="Doing")

    assignee_user = User.objects.create_user(email="assignee@example.com", password="Password123")
    participant = Participant.objects.create(
        event=event,
        user=assignee_user,
        role=Participant.Role.MEMBER,
    )

    task = Task.objects.create(list=task_list, title="Update me", assignee=participant)

    client = _make_client(assignee_user)
    response = client.post(
        f"/api/tasks/{task.id}/status/",
        data={"status": Task.Status.DOING},
        format="json",
    )
    assert response.status_code == 200
    assert response.json() == {"message": "status_updated", "status": Task.Status.DOING}

    task.refresh_from_db()
    assert task.status == Task.Status.DOING


def test_non_assignee_cannot_change_status() -> None:
    event, owner = _create_event_with_owner("owner4@example.com")
    task_list = TaskList.objects.create(event=event, title="Blocked")

    assignee_user = User.objects.create_user(email="assigned@example.com", password="Password123")
    assignee_participant = Participant.objects.create(
        event=event,
        user=assignee_user,
        role=Participant.Role.MEMBER,
    )
    task = Task.objects.create(list=task_list, title="Locked task", assignee=assignee_participant)

    outsider_user = User.objects.create_user(email="outsider@example.com", password="Password123")
    Participant.objects.create(event=event, user=outsider_user, role=Participant.Role.MEMBER)

    outsider_client = _make_client(outsider_user)
    response = outsider_client.post(
        f"/api/tasks/{task.id}/status/",
        data={"status": Task.Status.DONE},
        format="json",
    )

    assert response.status_code == 403
    body = response.json()
    assert body["code"] == "forbidden"
    assert task.status == Task.Status.TODO


def test_dependencies_block_doing_and_done_until_all_done() -> None:
    event, owner = _create_event_with_owner("owner5@example.com")
    task_list = TaskList.objects.create(event=event, title="Critical")

    dependency = Task.objects.create(list=task_list, title="Dependency", status=Task.Status.TODO)
    blocked_task = Task.objects.create(list=task_list, title="Blocked")
    blocked_task.depends_on.add(dependency)

    owner_client = _make_client(owner)

    attempt_doing = owner_client.post(
        f"/api/tasks/{blocked_task.id}/status/",
        data={"status": Task.Status.DOING},
        format="json",
    )
    assert attempt_doing.status_code == 400
    assert "status" in attempt_doing.json()

    dependency.status = Task.Status.DONE
    dependency.save(update_fields=["status"])

    retry_doing = owner_client.post(
        f"/api/tasks/{blocked_task.id}/status/",
        data={"status": Task.Status.DOING},
        format="json",
    )
    assert retry_doing.status_code == 200

    retry_done = owner_client.post(
        f"/api/tasks/{blocked_task.id}/status/",
        data={"status": Task.Status.DONE},
        format="json",
    )
    assert retry_done.status_code == 200
    blocked_task.refresh_from_db()
    assert blocked_task.status == Task.Status.DONE


def test_assignee_must_belong_to_same_event() -> None:
    target_event, owner = _create_event_with_owner("owner6@example.com")
    other_event, _ = _create_event_with_owner("other-owner@example.com")

    task_list = TaskList.objects.create(event=target_event, title="Main")
    task = Task.objects.create(list=task_list, title="Needs assignment")

    foreign_user = User.objects.create_user(email="foreign@example.com", password="Password123")
    foreign_participant = Participant.objects.create(
        event=other_event,
        user=foreign_user,
        role=Participant.Role.MEMBER,
    )

    client = _make_client(owner)
    response = client.post(
        f"/api/tasks/{task.id}/assign/",
        data={"assignee_participant_id": foreign_participant.id},
        format="json",
    )
    assert response.status_code == 400
    payload = response.json()
    assert "assignee_participant_id" in payload


def test_dates_validation_due_greater_equal_start() -> None:
    event, owner = _create_event_with_owner("owner7@example.com")
    task_list = TaskList.objects.create(event=event, title="Schedule")

    start_at = timezone.now()
    due_at = start_at - timedelta(hours=1)

    client = _make_client(owner)
    response = client.post(
        "/api/tasks/",
        data={
            "list": task_list.id,
            "title": "Invalid timing",
            "start_at": start_at.isoformat(),
            "due_at": due_at.isoformat(),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "due_at" in response.json()
