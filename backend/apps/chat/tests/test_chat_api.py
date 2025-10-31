from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.chat.models import Message
from apps.events.models import Event, Participant

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event(owner_email: str = "owner@example.com") -> tuple[Event, User]:
    owner = User.objects.create_user(email=owner_email, password="Password123")
    event = Event.objects.create(owner=owner, title="Demo")
    Participant.objects.get_or_create(
        event=event,
        user=owner,
        defaults={"role": Participant.Role.ORGANIZER},
    )
    return event, owner


def test_participant_can_list_and_post_messages_in_event() -> None:
    event, owner = _create_event()
    member = User.objects.create_user(email="member@example.com", password="Password123")
    Participant.objects.create(event=event, user=member, role=Participant.Role.MEMBER)

    Message.objects.create(event=event, author=owner, text="Привет!")

    client = _auth_client(member)
    list_response = client.get(f"/api/events/{event.id}/messages")
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["text"] == "Привет!"

    post_response = client.post(f"/api/events/{event.id}/messages", {"text": "   Новый текст   "}, format="json")
    assert post_response.status_code == 201
    created = post_response.json()
    assert created["text"] == "Новый текст"
    assert created["is_me"] is True
    assert created["author"] == member.id
    assert Message.objects.filter(event=event).count() == 2


def test_non_participant_forbidden() -> None:
    event, _ = _create_event()
    stranger = User.objects.create_user(email="stranger@example.com", password="Password123")
    client = _auth_client(stranger)

    list_response = client.get(f"/api/events/{event.id}/messages")
    assert list_response.status_code == 403

    post_response = client.post(f"/api/events/{event.id}/messages", {"text": "Привет"}, format="json")
    assert post_response.status_code == 403
    assert Message.objects.count() == 0


def test_messages_order_is_ascending_by_created_at() -> None:
    event, owner = _create_event()
    participant = User.objects.create_user(email="order@example.com", password="Password123")
    Participant.objects.create(event=event, user=participant, role=Participant.Role.MEMBER)

    older = Message.objects.create(event=event, author=owner, text="Старое")
    middle = Message.objects.create(event=event, author=participant, text="Среднее")
    newer = Message.objects.create(event=event, author=owner, text="Новое")

    Message.objects.filter(id=middle.id).update(created_at=older.created_at - timedelta(seconds=10))
    Message.objects.filter(id=newer.id).update(created_at=older.created_at + timedelta(seconds=5))

    client = _auth_client(participant)
    response = client.get(f"/api/events/{event.id}/messages")
    assert response.status_code == 200
    data = response.json()["results"]
    texts = [item["text"] for item in data]
    assert texts == ["Среднее", "Старое", "Новое"]


def test_pagination_and_before_after_id_filters() -> None:
    event, owner = _create_event()
    participant = User.objects.create_user(email="pages@example.com", password="Password123")
    Participant.objects.create(event=event, user=participant, role=Participant.Role.MEMBER)

    messages = []
    for index in range(1, 36):
        message = Message.objects.create(event=event, author=owner, text=f"Сообщение {index}")
        messages.append(message)

    client = _auth_client(participant)

    first_page = client.get(f"/api/events/{event.id}/messages", {"page_size": 5})
    assert first_page.status_code == 200
    assert [item["text"] for item in first_page.json()["results"]] == [f"Сообщение {i}" for i in range(1, 6)]

    before_id = messages[10].id
    before_page = client.get(
        f"/api/events/{event.id}/messages",
        {"before_id": before_id, "page_size": 5},
    )
    assert before_page.status_code == 200
    assert [item["text"] for item in before_page.json()["results"]] == [f"Сообщение {i}" for i in range(6, 11)]

    after_id = messages[-2].id
    after_page = client.get(
        f"/api/events/{event.id}/messages",
        {"after_id": after_id, "page_size": 5},
    )
    assert after_page.status_code == 200
    after_payload = after_page.json()["results"]
    assert len(after_payload) == 1
    assert after_payload[0]["text"] == "Сообщение 35"

    both_response = client.get(
        f"/api/events/{event.id}/messages",
        {"before_id": before_id, "after_id": messages[5].id, "page_size": 5},
    )
    assert both_response.status_code == 200
    both_texts = [item["text"] for item in both_response.json()["results"]]
    assert both_texts == [f"Сообщение {i}" for i in range(6, 11)]


def test_rate_limit_simple_antispam_429() -> None:
    event, _ = _create_event()
    participant = User.objects.create_user(email="spam@example.com", password="Password123")
    Participant.objects.create(event=event, user=participant, role=Participant.Role.MEMBER)

    client = _auth_client(participant)
    first = client.post(f"/api/events/{event.id}/messages", {"text": "Первое"}, format="json")
    assert first.status_code == 201

    second = client.post(f"/api/events/{event.id}/messages", {"text": "Второе"}, format="json")
    assert second.status_code == 429
    assert Message.objects.filter(event=event, author=participant).count() == 1


def test_trim_and_reject_empty_or_long_text() -> None:
    event, _ = _create_event()
    participant = User.objects.create_user(email="validate@example.com", password="Password123")
    Participant.objects.create(event=event, user=participant, role=Participant.Role.MEMBER)

    client = _auth_client(participant)

    response = client.post(f"/api/events/{event.id}/messages", {"text": "   Обрезка   "}, format="json")
    assert response.status_code == 201
    assert response.json()["text"] == "Обрезка"

    empty_response = client.post(f"/api/events/{event.id}/messages", {"text": "   "}, format="json")
    assert empty_response.status_code == 400

    long_text = "x" * 4001
    too_long_response = client.post(f"/api/events/{event.id}/messages", {"text": long_text}, format="json")
    assert too_long_response.status_code == 400

