from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.events.models import Event, Participant
from apps.users.models import User


@pytest.mark.django_db()
def test_user_creation() -> None:
    """Проверяет создание обычного пользователя и суперпользователя."""
    user = User.objects.create_user(email="user@example.com", password="password123", name="Test User")
    superuser = User.objects.create_superuser(email="admin@example.com", password="password456")

    assert user.email == "user@example.com"
    assert user.is_staff is False
    assert superuser.is_staff is True
    assert superuser.is_superuser is True


@pytest.mark.django_db()
def test_event_str_returns_title() -> None:
    """Проверяет строковое представление события."""
    owner = User.objects.create_user(email="owner@example.com", password="password123")
    event = Event.objects.create(
        owner=owner,
        title="Demo Event",
        start_at=timezone.now(),
        end_at=timezone.now(),
    )

    assert str(event) == "Demo Event"


@pytest.mark.django_db()
def test_participant_constraints() -> None:
    """Убеждаемся, что дубликаты запрещены и валидируются роли."""
    owner = User.objects.create_user(email="owner2@example.com", password="password123")
    member = User.objects.create_user(email="member@example.com", password="password123")
    event = Event.objects.create(owner=owner, title="Unique Event")

    Participant.objects.create(user=member, event=event, role=Participant.Role.MEMBER)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Participant.objects.create(user=member, event=event, role=Participant.Role.ORGANIZER)

    participant = Participant(user=member, event=event, role="invalid")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        participant.full_clean()
