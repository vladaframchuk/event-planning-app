from __future__ import annotations

from datetime import timedelta

import pytest
from django.core import mail
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.events.models import Event, Participant
from apps.notifications.tasks import (
    send_daily_digest,
    send_deadline_reminders,
    send_poll_closing_notifications,
)
from apps.polls.models import Poll, PollOption, Vote
from apps.tasks.models import Task, TaskList
from apps.users.models import User

pytestmark = pytest.mark.django_db


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_send_deadline_reminders_sends_emails_once() -> None:
    now = timezone.now()
    owner = User.objects.create_user(email="owner@example.com", password="Password123")
    assignee_user = User.objects.create_user(email="assignee@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Demo event")
    owner_participant = Participant.objects.create(
        user=owner,
        event=event,
        role=Participant.Role.ORGANIZER,
    )
    assignee_participant = Participant.objects.create(
        user=assignee_user,
        event=event,
        role=Participant.Role.MEMBER,
    )
    task_list = TaskList.objects.create(event=event, title="ToDo")
    task = Task.objects.create(
        list=task_list,
        title="Prepare report",
        due_at=now + timedelta(hours=10),
        assignee=assignee_participant,
    )

    result = send_deadline_reminders()
    assert result == 2
    assert {email.to[0] for email in mail.outbox} == {"owner@example.com", "assignee@example.com"}

    task.refresh_from_db()
    assert task.deadline_reminder_sent_at is not None
    assert task.deadline_reminder_for_due_at == task.due_at

    mail.outbox.clear()

    second_result = send_deadline_reminders()
    assert second_result == 0
    assert len(mail.outbox) == 0


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_send_poll_closing_notifications_once() -> None:
    now = timezone.now()
    owner = User.objects.create_user(email="owner@example.com", password="Password123")
    voter = User.objects.create_user(email="voter@example.com", password="Password123")
    event = Event.objects.create(owner=owner, title="Demo event")
    Participant.objects.create(user=owner, event=event, role=Participant.Role.ORGANIZER)
    Participant.objects.create(user=voter, event=event, role=Participant.Role.MEMBER)

    poll = Poll.objects.create(
        event=event,
        created_by=owner,
        type=Poll.Type.CUSTOM,
        question="Where shall we meet?",
        multiple=False,
        end_at=now - timedelta(minutes=5),
    )
    option_a = PollOption.objects.create(poll=poll, label="Cafe")
    option_b = PollOption.objects.create(poll=poll, label="Office")
    Vote.objects.create(poll=poll, option=option_a, user=owner)
    Vote.objects.create(poll=poll, option=option_b, user=voter)

    result = send_poll_closing_notifications()
    assert result == 2
    recipients = {email.to[0] for email in mail.outbox}
    assert recipients == {"owner@example.com", "voter@example.com"}

    poll.refresh_from_db()
    assert poll.closing_notification_sent_at is not None
    assert poll.closing_notification_for_end_at == poll.end_at

    mail.outbox.clear()

    second_result = send_poll_closing_notifications()
    assert second_result == 0
    assert len(mail.outbox) == 0


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_notifications_test_endpoint() -> None:
    user = User.objects.create_user(email="tester@example.com", password="Password123")
    client = _auth_client(user)

    response = client.post("/api/notifications/test")
    assert response.status_code == 200
    assert response.json() == {"detail": "email_sent"}
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["tester@example.com"]


def test_daily_digest_returns_zero() -> None:
    assert send_daily_digest() == 0
