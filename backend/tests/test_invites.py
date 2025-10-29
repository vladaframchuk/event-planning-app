from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Invite, Participant

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def test_owner_can_create_invite_and_get_invite_url(settings) -> None:
    """Владелец события может создать инвайт и получить готовую ссылку."""
    settings.SITE_FRONT_URL = "http://frontend.test"
    owner = User.objects.create_user(email="owner@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Private Meetup")
    client = _auth_client(owner)

    response = client.post(
        f"/api/events/{event.id}/invites",
        data={"expires_in_hours": 48, "max_uses": 5},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["max_uses"] == 5
    assert payload["uses_count"] == 0
    assert payload["is_revoked"] is False
    assert payload["invite_url"] == f"http://frontend.test/join?token={payload['token']}"

    invite = Invite.objects.get(token=payload["token"])
    assert invite.event_id == event.id
    assert invite.created_by_id == owner.id

    expires_at = _parse_iso(payload["expires_at"])
    expected = timezone.now() + timedelta(hours=48)
    assert abs((invite.expires_at - expected).total_seconds()) < 10
    assert abs((expires_at - invite.expires_at).total_seconds()) < 1


def test_validate_invite_ok_and_expired_and_revoked_and_exhausted() -> None:
    """Публичная валидация корректно различает состояния инвайта."""
    owner = User.objects.create_user(email="state@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Stateful Event", location="Berlin")

    invite_ok = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=4),
        max_uses=3,
    )
    invite_expired = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() - timedelta(hours=1),
    )
    invite_revoked = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=2),
        is_revoked=True,
    )
    invite_exhausted = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=2),
        max_uses=1,
        uses_count=1,
    )

    client = APIClient()

    ok_response = client.get("/api/invites/validate", {"token": invite_ok.token})
    assert ok_response.status_code == 200
    ok_body = ok_response.json()
    assert ok_body["status"] == "ok"
    assert ok_body["event"]["id"] == event.id
    assert ok_body["event"]["title"] == event.title
    assert ok_body["event"]["location"] == "Berlin"
    assert ok_body["uses_left"] == 3

    expired_response = client.get("/api/invites/validate", {"token": invite_expired.token})
    assert expired_response.status_code == 200
    assert expired_response.json()["status"] == "expired"

    revoked_response = client.get("/api/invites/validate", {"token": invite_revoked.token})
    assert revoked_response.status_code == 200
    assert revoked_response.json()["status"] == "revoked"

    exhausted_response = client.get("/api/invites/validate", {"token": invite_exhausted.token})
    assert exhausted_response.status_code == 200
    exhausted_body = exhausted_response.json()
    assert exhausted_body["status"] == "exhausted"
    assert exhausted_body["uses_left"] == 0

    missing_response = client.get("/api/invites/validate", {"token": "missing"})
    assert missing_response.status_code == 200
    assert missing_response.json() == {
        "status": "not_found",
        "event": None,
        "uses_left": None,
        "expires_at": None,
    }


def test_accept_invite_creates_participant_and_increments_uses() -> None:
    """Успешное принятие инвайта добавляет участника и увеличивает счетчик использований."""
    owner = User.objects.create_user(email="creator@example.com", password="Password123")
    attendee = User.objects.create_user(email="member@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Joinable Event")
    invite = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=2),
        max_uses=5,
    )

    client = _auth_client(attendee)
    response = client.post("/api/invites/accept", data={"token": invite.token}, format="json")

    assert response.status_code == 201
    assert response.json() == {"message": "joined", "event_id": event.id}
    assert Participant.objects.filter(event=event, user=attendee, role=Participant.Role.MEMBER).exists()

    invite.refresh_from_db()
    assert invite.uses_count == 1


def test_accept_invite_when_already_member_returns_already_member() -> None:
    """Повторное использование инвайта участником возвращает already_member без ошибок."""
    owner = User.objects.create_user(email="owner2@example.com", password="Password123")
    member = User.objects.create_user(email="member2@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Membership Event")
    invite = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=2),
        max_uses=1,
        uses_count=1,
    )
    Participant.objects.create(event=event, user=member, role=Participant.Role.MEMBER)

    client = _auth_client(member)
    response = client.post("/api/invites/accept", data={"token": invite.token}, format="json")

    assert response.status_code == 200
    assert response.json() == {"message": "already_member"}
    invite.refresh_from_db()
    assert invite.uses_count == 1


def test_non_owner_cannot_revoke_others_invite() -> None:
    """Только владелец события может отзывать инвайт."""
    owner = User.objects.create_user(email="revoker@example.com", password="Password123")
    stranger = User.objects.create_user(email="stranger@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Revocable Event")
    invite = Invite.objects.create(
        event=event,
        created_by=owner,
        expires_at=timezone.now() + timedelta(hours=4),
    )

    stranger_client = _auth_client(stranger)
    forbidden_response = stranger_client.post("/api/invites/revoke", data={"token": invite.token}, format="json")
    assert forbidden_response.status_code == 403

    invite.refresh_from_db()
    assert invite.is_revoked is False

    owner_client = _auth_client(owner)
    success_response = owner_client.post("/api/invites/revoke", data={"token": invite.token}, format="json")
    assert success_response.status_code == 200
    assert success_response.json() == {"message": "revoked"}

    invite.refresh_from_db()
    assert invite.is_revoked is True
