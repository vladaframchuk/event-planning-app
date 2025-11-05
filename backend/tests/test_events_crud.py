from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Participant

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_create_event_sets_owner_and_participant() -> None:
    """При создании событие связывается с владельцем и добавляется организатор."""
    user = User.objects.create_user(email="owner@example.com", password="Password123")
    client = _auth_client(user)

    payload = {
        "title": "Product Launch",
        "category": "meetup",
        "description": "Обсуждаем запуск.",
        "start_at": (timezone.now() + timedelta(days=1)).isoformat(),
        "end_at": (timezone.now() + timedelta(days=2)).isoformat(),
        "location": "Berlin",
    }

    response = client.post("/api/events/", data=payload, format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["owner"]["id"] == user.id
    assert body["owner"]["email"] == user.email

    event = Event.objects.get(pk=body["id"])
    assert event.owner_id == user.id
    assert Participant.objects.filter(
        event=event,
        user=user,
        role=Participant.Role.ORGANIZER,
    ).exists()


def test_list_shows_only_my_events() -> None:
    """В списке отображаются только мои события или события, где я участник."""
    owner = User.objects.create_user(email="owner@example.com", password="Password123")
    other = User.objects.create_user(email="other@example.com", password="Password123")
    third = User.objects.create_user(email="third@example.com", password="Password123")

    my_event = Event.objects.create(owner=owner, title="My Event")
    shared_event = Event.objects.create(owner=other, title="Shared Event")
    Participant.objects.create(event=shared_event, user=owner, role=Participant.Role.MEMBER)
    foreign_event = Event.objects.create(owner=third, title="Foreign Event")

    client = _auth_client(owner)
    response = client.get("/api/events/")

    assert response.status_code == 200
    results = response.json()["results"]
    titles = {item["title"] for item in results}
    assert titles == {"My Event", "Shared Event"}
    assert all(item["title"] != foreign_event.title for item in results)


def test_update_and_delete_only_for_owner() -> None:
    """Редактировать и удалять событие может только владелец."""
    owner = User.objects.create_user(email="owner@example.com", password="Password123")
    participant = User.objects.create_user(email="participant@example.com", password="Password123")

    event = Event.objects.create(owner=owner, title="Initial Title")
    Participant.objects.create(event=event, user=participant, role=Participant.Role.MEMBER)

    owner_client = _auth_client(owner)
    participant_client = _auth_client(participant)

    update_response = owner_client.patch(
        f"/api/events/{event.id}/", data={"title": "Updated Title"}, format="json"
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Updated Title"

    forbidden_update = participant_client.patch(
        f"/api/events/{event.id}/", data={"title": "Hack Title"}, format="json"
    )
    assert forbidden_update.status_code == 403

    forbidden_delete = participant_client.delete(f"/api/events/{event.id}/")
    assert forbidden_delete.status_code == 403

    delete_response = owner_client.delete(f"/api/events/{event.id}/")
    assert delete_response.status_code == 204
    assert not Event.objects.filter(pk=event.id).exists()


def test_event_organizer_can_update_event_details() -> None:
    """Организатор события получает права на редактирование."""
    owner = User.objects.create_user(email="owner-organizer@example.com", password="Password123")
    organizer = User.objects.create_user(email="coorganizer@example.com", password="Password123")

    event = Event.objects.create(owner=owner, title="Collab Event")
    Participant.objects.create(event=event, user=organizer, role=Participant.Role.ORGANIZER)

    organizer_client = _auth_client(organizer)
    response = organizer_client.patch(
        f"/api/events/{event.id}/",
        data={"title": "Organizer Update"},
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Organizer Update"
    event.refresh_from_db()
    assert event.title == "Organizer Update"


def test_filter_search_ordering() -> None:
    """Проверяем работу фильтров, поиска и сортировки."""
    user = User.objects.create_user(email="filter@example.com", password="Password123")
    client = _auth_client(user)
    now = timezone.now()

    event_future_long = Event.objects.create(
        owner=user,
        title="Product Launch",
        category="meetup",
        start_at=now + timedelta(days=5),
    )
    event_future_short = Event.objects.create(
        owner=user,
        title="Team Workshop",
        category="workshop",
        start_at=now + timedelta(days=2),
    )
    event_past = Event.objects.create(
        owner=user,
        title="Retrospective",
        category="retro",
        start_at=now - timedelta(days=3),
    )
    event_without_date = Event.objects.create(
        owner=user,
        title="No Date Event",
        category="misc",
    )

    search_response = client.get("/api/events/", {"search": "Launch"})
    assert [item["id"] for item in search_response.json()["results"]] == [event_future_long.id]

    category_response = client.get("/api/events/", {"category": "workshop"})
    category_ids = [item["id"] for item in category_response.json()["results"]]
    assert category_ids == [event_future_short.id]

    upcoming_response = client.get("/api/events/", {"upcoming": "true"})
    upcoming_ids = [item["id"] for item in upcoming_response.json()["results"]]
    assert upcoming_ids == [event_future_short.id, event_future_long.id]

    past_response = client.get("/api/events/", {"upcoming": "false"})
    past_ids = [item["id"] for item in past_response.json()["results"]]
    assert set(past_ids) == {event_past.id, event_without_date.id}

    ordering_response = client.get("/api/events/", {"ordering": "-start_at"})
    ordering_payload = ordering_response.json()["results"]
    ordering_with_dates = [item["id"] for item in ordering_payload if item["start_at"] is not None]
    assert ordering_with_dates == [
        event_future_long.id,
        event_future_short.id,
        event_past.id,
    ]


def test_categories_endpoint_returns_unique_sorted_categories() -> None:
    """Эндпоинт категорий возвращает уникальные значения пользователя."""
    owner = User.objects.create_user(email="cats@example.com", password="Password123")
    other = User.objects.create_user(email="cats2@example.com", password="Password123")
    client = _auth_client(owner)

    Event.objects.create(owner=owner, title="Product", category="meetup")
    Event.objects.create(owner=owner, title="Workshop", category="workshop")
    Event.objects.create(owner=owner, title="Community", category="community")
    Event.objects.create(owner=owner, title="Empty")
    Event.objects.create(owner=other, title="Foreign", category="meetup")

    response = client.get("/api/events/categories/")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "categories": ["community", "meetup", "workshop"],
    }
