from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.polls.models import Poll, PollOption, Vote

pytestmark = pytest.mark.django_db()

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_event_with_owner(email: str = "owner@polls.com") -> tuple[Event, User]:
    owner = User.objects.create_user(email=email, password="Password123")
    event = Event.objects.create(owner=owner, title="Poll Demo")
    Participant.objects.get_or_create(
        event=event,
        user=owner,
        defaults={"role": Participant.Role.ORGANIZER},
    )
    return event, owner


def _add_participant(event: Event, email: str) -> User:
    member = User.objects.create_user(email=email, password="Password123")
    Participant.objects.create(event=event, user=member, role=Participant.Role.MEMBER)
    return member


def test_owner_creates_poll_with_unique_options() -> None:
    event, owner = _create_event_with_owner()
    client = _auth_client(owner)

    payload = {
        "type": Poll.Type.DATE,
        "question": "Когда встречаемся?",
        "multiple": False,
        "allow_change_vote": True,
        "end_at": None,
        "options": [
            {"date_value": "2025-11-01"},
            {"date_value": "2025-11-02"},
            {"date_value": "2025-11-03"},
        ],
    }

    response = client.post(f"/api/events/{event.id}/polls", data=payload, format="json")

    assert response.status_code == 201
    data = response.json()
    assert data["question"] == payload["question"]
    assert data["type"] == Poll.Type.DATE
    assert data["options"][0]["votes_count"] == 0

    poll = Poll.objects.get(event=event)
    option_dates = {option.date_value for option in poll.options.all()}
    assert option_dates == {
        date(2025, 11, 1),
        date(2025, 11, 2),
        date(2025, 11, 3),
    }


def test_participant_lists_and_reads_polls() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@polls.com")

    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Любимый напиток?",
        multiple=False,
        allow_change_vote=True,
    )
    option_a = PollOption.objects.create(poll=poll, label="Кофе")
    option_b = PollOption.objects.create(poll=poll, label="Чай")

    Vote.objects.create(poll=poll, option=option_a, user=owner)
    Vote.objects.create(poll=poll, option=option_b, user=member)

    client = _auth_client(member)

    list_response = client.get(f"/api/events/{event.id}/polls")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload["count"] == 1
    assert len(list_payload["results"]) == 1
    item = list_payload["results"][0]
    assert item["id"] == poll.id
    assert item["total_votes"] == 2
    assert sorted(option["votes_count"] for option in item["options"]) == [1, 1]

    detail_response = client.get(f"/api/polls/{poll.id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["id"] == poll.id
    assert detail_payload["total_votes"] == 2
    assert sorted(detail_payload["my_votes"]) == [option_b.id]
    assert sorted(detail_payload["leader_option_ids"]) == sorted([option_a.id, option_b.id])


def test_vote_single_choice_blocks_second_vote_when_no_change_allowed() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@single.com")
    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.PLACE,
        question="Где встречаемся?",
        multiple=False,
        allow_change_vote=False,
    )
    option_a = PollOption.objects.create(poll=poll, label="Офис")
    option_b = PollOption.objects.create(poll=poll, label="Коворкинг")

    client = _auth_client(member)

    first_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_a.id]},
        format="json",
    )
    assert first_response.status_code == 200
    assert first_response.json()["my_votes"] == [option_a.id]

    second_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_b.id]},
        format="json",
    )
    assert second_response.status_code == 400
    assert Vote.objects.filter(poll=poll, user=member).count() == 1
    assert Vote.objects.filter(poll=poll, user=member, option=option_a).exists()


def test_vote_single_choice_replaces_when_allowed() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@replace.com")
    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.PLACE,
        question="Ресторан?",
        multiple=False,
        allow_change_vote=True,
    )
    option_a = PollOption.objects.create(poll=poll, label="Итальянский")
    option_b = PollOption.objects.create(poll=poll, label="Японский")

    client = _auth_client(member)

    first_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_a.id]},
        format="json",
    )
    assert first_response.status_code == 200
    assert first_response.json()["my_votes"] == [option_a.id]

    second_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_b.id]},
        format="json",
    )
    assert second_response.status_code == 200
    payload = second_response.json()
    assert payload["my_votes"] == [option_b.id]
    assert payload["total_votes"] == 1
    assert Vote.objects.filter(poll=poll, user=member, option=option_a).count() == 0
    assert Vote.objects.filter(poll=poll, user=member, option=option_b).count() == 1


def test_vote_multi_adds_and_removes_when_allowed() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@multi.com")
    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Выбираем активности",
        multiple=True,
        allow_change_vote=True,
    )
    option_a = PollOption.objects.create(poll=poll, label="Боулинг")
    option_b = PollOption.objects.create(poll=poll, label="Квест")
    option_c = PollOption.objects.create(poll=poll, label="Кино")

    client = _auth_client(member)

    first_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_a.id, option_b.id]},
        format="json",
    )
    assert first_response.status_code == 200
    assert sorted(first_response.json()["my_votes"]) == sorted([option_a.id, option_b.id])

    second_response = client.post(
        f"/api/polls/{poll.id}/vote",
        data={"option_ids": [option_b.id, option_c.id]},
        format="json",
    )
    assert second_response.status_code == 200
    payload = second_response.json()
    assert sorted(payload["my_votes"]) == sorted([option_b.id, option_c.id])
    assert Vote.objects.filter(poll=poll, user=member, option=option_a).count() == 0
    assert Vote.objects.filter(poll=poll, user=member, option=option_b).count() == 1
    assert Vote.objects.filter(poll=poll, user=member, option=option_c).count() == 1


def test_cannot_vote_when_closed_or_expired() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@closed.com")

    closed_poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.PLACE,
        question="Закрытый вопрос",
        is_closed=True,
    )
    closed_option = PollOption.objects.create(poll=closed_poll, label="Вариант 1")

    expired_poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.PLACE,
        question="Просроченный вопрос",
        end_at=timezone.now() - timedelta(hours=1),
    )
    expired_option = PollOption.objects.create(poll=expired_poll, label="Вариант 2")

    client = _auth_client(member)

    closed_response = client.post(
        f"/api/polls/{closed_poll.id}/vote",
        data={"option_ids": [closed_option.id]},
        format="json",
    )
    assert closed_response.status_code == 400

    expired_response = client.post(
        f"/api/polls/{expired_poll.id}/vote",
        data={"option_ids": [expired_option.id]},
        format="json",
    )
    assert expired_response.status_code == 400


def test_only_owner_can_close_or_delete() -> None:
    event, owner = _create_event_with_owner()
    member = _add_participant(event, "member@permissions.com")
    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Разрешения",
    )
    PollOption.objects.create(poll=poll, label="Вариант 1")

    member_client = _auth_client(member)
    owner_client = _auth_client(owner)

    forbidden_close = member_client.post(f"/api/polls/{poll.id}/close")
    assert forbidden_close.status_code == 403

    allowed_close = owner_client.post(f"/api/polls/{poll.id}/close")
    assert allowed_close.status_code == 200
    poll.refresh_from_db()
    assert poll.is_closed is True

    forbidden_delete = member_client.delete(f"/api/polls/{poll.id}")
    assert forbidden_delete.status_code == 403

    allowed_delete = owner_client.delete(f"/api/polls/{poll.id}")
    assert allowed_delete.status_code == 204
    assert Poll.objects.filter(id=poll.id).count() == 0


def test_leader_option_ids_and_counts_correct() -> None:
    event, owner = _create_event_with_owner()
    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Подводим итоги",
    )
    option_a = PollOption.objects.create(poll=poll, label="A")
    option_b = PollOption.objects.create(poll=poll, label="B")
    option_c = PollOption.objects.create(poll=poll, label="C")

    voters = [owner]
    for idx in range(1, 7):
        voter = _add_participant(event, f"voter{idx}@leaders.com")
        voters.append(voter)

    for voter in voters[:3]:
        Vote.objects.create(poll=poll, option=option_a, user=voter)
    for voter in voters[3:6]:
        Vote.objects.create(poll=poll, option=option_b, user=voter)
    Vote.objects.create(poll=poll, option=option_c, user=voters[6])

    client = _auth_client(voters[1])
    response = client.get(f"/api/polls/{poll.id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_votes"] == 7
    assert sorted(payload["leader_option_ids"]) == sorted([option_a.id, option_b.id])
