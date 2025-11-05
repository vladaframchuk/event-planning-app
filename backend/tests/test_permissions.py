from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.chat.models import Message
from apps.events.models import Event, Participant
from apps.polls.models import Poll, PollOption
from apps.tasks.models import Task, TaskList

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _make_user(email: str) -> User:
    return User.objects.create_user(email=email, password="Password123")


def _make_event_with_participants(
    organizer_email: str,
    *member_emails: str,
) -> tuple[Event, User, list[User]]:
    organizer = _make_user(organizer_email)
    event = Event.objects.create(owner=organizer, title="Weekly Review")
    Participant.objects.create(
        event=event, user=organizer, role=Participant.Role.ORGANIZER
    )
    members: list[User] = []
    for email in member_emails:
        member = _make_user(email)
        Participant.objects.create(
            event=event, user=member, role=Participant.Role.MEMBER
        )
        members.append(member)
    return event, organizer, members


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_member_cannot_update_foreign_task() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner@example.com", "member@example.com"
    )
    task_list = TaskList.objects.create(event=event, title="Todos")
    task = Task.objects.create(list=task_list, title="Restricted task")

    client = _auth_client(member)
    response = client.patch(
        f"/api/tasks/{task.id}/", data={"title": "Hacked"}, format="json"
    )

    assert response.status_code == 403
    task.refresh_from_db()
    assert task.title == "Restricted task"


def test_assignee_cannot_modify_non_status_fields() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner2@example.com", "member2@example.com"
    )
    task_list = TaskList.objects.create(event=event, title="Backlog")
    participant = Participant.objects.get(event=event, user=member)
    task = Task.objects.create(list=task_list, title="My task", assignee=participant)

    client = _auth_client(member)
    response = client.patch(
        f"/api/tasks/{task.id}/", data={"title": "Updated by assignee"}, format="json"
    )

    assert response.status_code == 403
    task.refresh_from_db()
    assert task.title == "My task"


def test_member_cannot_create_poll() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner3@example.com", "member3@example.com"
    )
    client = _auth_client(member)
    payload = {
        "type": Poll.Type.CUSTOM,
        "question": "Choose option",
        "options": [{"label": "A"}, {"label": "B"}],
    }

    response = client.post(f"/api/events/{event.id}/polls", data=payload, format="json")

    assert response.status_code == 403


def test_member_cannot_close_poll() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner4@example.com", "member4@example.com"
    )
    poll = Poll.objects.create(
        event=event,
        created_by=organizer,
        type=Poll.Type.CUSTOM,
        question="Close me?",
    )
    PollOption.objects.create(poll=poll, label="Yes")
    PollOption.objects.create(poll=poll, label="No")

    client = _auth_client(member)
    response = client.post(f"/api/polls/{poll.id}/close")

    assert response.status_code == 403
    poll.refresh_from_db()
    assert not poll.is_closed


def test_member_can_vote_in_poll() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner5@example.com", "member5@example.com"
    )
    poll = Poll.objects.create(
        event=event,
        created_by=organizer,
        type=Poll.Type.CUSTOM,
        question="Vote please",
    )
    option_a = PollOption.objects.create(poll=poll, label="A")
    PollOption.objects.create(poll=poll, label="B")

    client = _auth_client(member)
    response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_a.id]},
        format="json",
    )

    assert response.status_code == 200
    assert option_a.id in response.json()["my_votes"]


def test_author_can_delete_chat_message() -> None:
    event, organizer, [member] = _make_event_with_participants(
        "owner6@example.com", "member6@example.com"
    )
    message = Message.objects.create(event=event, author=member, text="Hello world")

    client = _auth_client(member)
    response = client.delete(f"/api/events/{event.id}/messages/{message.id}")

    assert response.status_code == 204
    assert not Message.objects.filter(id=message.id).exists()


def test_non_author_non_organizer_cannot_delete_message() -> None:
    event, organizer, members = _make_event_with_participants(
        "owner7@example.com",
        "author@example.com",
        "outsider@example.com",
    )
    author, outsider = members
    message = Message.objects.create(event=event, author=author, text="Secret note")

    client = _auth_client(outsider)
    response = client.delete(f"/api/events/{event.id}/messages/{message.id}")

    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"
    assert Message.objects.filter(id=message.id).exists()
