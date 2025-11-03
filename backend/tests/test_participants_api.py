from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event, Participant

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _make_user(email: str) -> User:
    return User.objects.create_user(email=email, password="Password123")


def _make_event_with_organizer(email: str) -> tuple[Event, User]:
    user = _make_user(email)
    event = Event.objects.create(owner=user, title="Team Sync")
    Participant.objects.create(event=event, user=user, role=Participant.Role.ORGANIZER)
    return event, user


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_organizer_can_list_participants() -> None:
    event, organizer = _make_event_with_organizer("owner@example.com")
    member_user = _make_user("member@example.com")
    Participant.objects.create(event=event, user=member_user, role=Participant.Role.MEMBER)

    client = _auth_client(organizer)
    response = client.get(f"/api/events/{event.id}/participants")

    assert response.status_code == 200
    payload = response.json()
    assert "results" in payload
    roles = {item["user"]["email"]: item["role"] for item in payload["results"]}
    assert roles["owner@example.com"] == Participant.Role.ORGANIZER
    assert roles["member@example.com"] == Participant.Role.MEMBER


def test_member_cannot_list_participants() -> None:
    event, organizer = _make_event_with_organizer("owner2@example.com")
    member_user = _make_user("member2@example.com")
    Participant.objects.create(event=event, user=member_user, role=Participant.Role.MEMBER)

    client = _auth_client(member_user)
    response = client.get(f"/api/events/{event.id}/participants")

    assert response.status_code == 403


def test_organizer_can_update_participant_role() -> None:
    event, organizer = _make_event_with_organizer("owner3@example.com")
    participant_user = _make_user("member3@example.com")
    participant = Participant.objects.create(event=event, user=participant_user, role=Participant.Role.MEMBER)

    client = _auth_client(organizer)
    response = client.patch(
        f"/api/events/{event.id}/participants/{participant.id}",
        data={"role": Participant.Role.ORGANIZER},
        format="json",
    )

    assert response.status_code == 200
    participant.refresh_from_db()
    assert participant.role == Participant.Role.ORGANIZER


def test_member_cannot_update_participant_role() -> None:
    event, organizer = _make_event_with_organizer("owner4@example.com")
    member_user = _make_user("member4@example.com")
    Participant.objects.create(event=event, user=member_user, role=Participant.Role.MEMBER)
    other_user = _make_user("other4@example.com")
    other_participant = Participant.objects.create(event=event, user=other_user, role=Participant.Role.MEMBER)

    client = _auth_client(member_user)
    response = client.patch(
        f"/api/events/{event.id}/participants/{other_participant.id}",
        data={"role": Participant.Role.ORGANIZER},
        format="json",
    )

    assert response.status_code == 403
    other_participant.refresh_from_db()
    assert other_participant.role == Participant.Role.MEMBER


def test_cannot_demote_last_organizer() -> None:
    event, organizer = _make_event_with_organizer("owner5@example.com")

    client = _auth_client(organizer)
    response = client.patch(
        f"/api/events/{event.id}/participants/{Participant.objects.get(event=event, user=organizer).id}",
        data={"role": Participant.Role.MEMBER},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "last_organizer"


def test_cannot_self_demote_if_only_organizer() -> None:
    event, organizer = _make_event_with_organizer("owner6@example.com")
    member_user = _make_user("member6@example.com")
    Participant.objects.create(event=event, user=member_user, role=Participant.Role.MEMBER)
    organizer_participant = Participant.objects.get(event=event, user=organizer)

    client = _auth_client(organizer)
    response = client.patch(
        f"/api/events/{event.id}/participants/{organizer_participant.id}",
        data={"role": Participant.Role.MEMBER},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "self_last_organizer"
    organizer_participant.refresh_from_db()
    assert organizer_participant.role == Participant.Role.ORGANIZER


def test_organizer_can_remove_participant() -> None:
    event, organizer = _make_event_with_organizer("owner7@example.com")
    member_user = _make_user("member7@example.com")
    participant = Participant.objects.create(event=event, user=member_user, role=Participant.Role.MEMBER)

    client = _auth_client(organizer)
    response = client.delete(f"/api/events/{event.id}/participants/{participant.id}")

    assert response.status_code == 204
    assert not Participant.objects.filter(id=participant.id).exists()


def test_cannot_remove_last_organizer() -> None:
    event, organizer = _make_event_with_organizer("owner8@example.com")
    organizer_participant = Participant.objects.get(event=event, user=organizer)

    client = _auth_client(organizer)
    response = client.delete(f"/api/events/{event.id}/participants/{organizer_participant.id}")

    assert response.status_code == 400
    assert response.json()["code"] == "last_organizer"
