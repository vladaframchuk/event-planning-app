from __future__ import annotations

from datetime import timedelta
from typing import Any

from celery import shared_task
from django.db.models import Count, F, Prefetch, Q
from django.utils import timezone

from apps.common.emailing import send_templated_email
from apps.polls.models import Poll, PollOption
from apps.tasks.models import Task
from apps.users.models import User

TASK_REMINDER_LOOKAHEAD = timedelta(hours=24)
TASK_REMINDER_COOLDOWN = timedelta(hours=12)


def _should_notify(user: User | None) -> bool:
    """Проверяет, согласен ли пользователь получать уведомления."""
    if user is None:
        return False
    if not user.is_active:
        return False
    if not user.email:
        return False
    if not getattr(user, "email_notifications_enabled", True):
        return False
    return True


def _collect_task_recipients(task: Task) -> list[User]:
    """Возвращает список пользователей, которым нужно напомнить о задаче."""
    recipients: list[User] = []
    if task.assignee and _should_notify(task.assignee.user):
        recipients.append(task.assignee.user)

    event_owner = getattr(task.list.event, "owner", None)
    if event_owner and _should_notify(event_owner):
        if all(existing.pk != event_owner.pk for existing in recipients):
            recipients.append(event_owner)
    return recipients


@shared_task
def send_deadline_reminders() -> int:
    """Отправляет письма по задачам, дедлайн которых наступит в ближайшие 24 часа."""
    now = timezone.now()
    window_end = now + TASK_REMINDER_LOOKAHEAD
    cooldown_threshold = now - TASK_REMINDER_COOLDOWN

    tasks_queryset = (
        Task.objects.select_related("list__event__owner", "assignee__user", "list")
        .filter(
            due_at__isnull=False,
            due_at__gte=now,
            due_at__lte=window_end,
            status__in=[Task.Status.TODO, Task.Status.DOING],
        )
        .filter(
            Q(deadline_reminder_sent_at__isnull=True)
            | Q(deadline_reminder_sent_at__lt=cooldown_threshold)
            | ~Q(deadline_reminder_for_due_at=F("due_at"))
        )
    )

    recipient_map: dict[int, dict[str, Any]] = {}
    tasks_to_update: list[Task] = []

    for task in tasks_queryset:
        recipients = _collect_task_recipients(task)
        if not recipients:
            continue

        task.deadline_reminder_sent_at = now
        task.deadline_reminder_for_due_at = task.due_at
        tasks_to_update.append(task)

        task_payload = {
            "title": task.title,
            "due_at": task.due_at,
            "event_title": task.list.event.title,
            "list_title": task.list.title,
        }
        for user in recipients:
            payload = recipient_map.setdefault(user.pk, {"user": user, "tasks": []})
            payload["tasks"].append(task_payload)

    if tasks_to_update:
        Task.objects.bulk_update(
            tasks_to_update,
            ["deadline_reminder_sent_at", "deadline_reminder_for_due_at"],
        )

    emails_sent = 0
    for payload in recipient_map.values():
        user: User = payload["user"]
        send_templated_email(
            to=[user.email],
            subject="Напоминание о задачах с приближающимся дедлайном",
            template="email/deadline_reminder.html",
            context={
                "user": user,
                "tasks": payload["tasks"],
            },
        )
        emails_sent += 1

    return emails_sent


@shared_task
def send_poll_closing_notifications() -> int:
    """Отправляет сводку результатов опросов, которые завершились."""
    now = timezone.now()
    polls = (
        Poll.objects.select_related("event__owner")
        .prefetch_related(
            Prefetch(
                "options",
                queryset=PollOption.objects.annotate(votes_count=Count("votes")),
            ),
            "event__participants__user",
        )
        .filter(
            Q(end_at__isnull=False, end_at__lte=now) | Q(is_closed=True),
        )
    )

    polls_to_update: list[Poll] = []
    emails_sent = 0

    for poll in polls:
        already_notified = (
            poll.closing_notification_sent_at is not None
            and poll.closing_notification_for_end_at == poll.end_at
        )
        if already_notified:
            continue

        recipients: dict[int, User] = {}
        event_owner = getattr(poll.event, "owner", None)
        if _should_notify(event_owner):
            recipients[event_owner.pk] = event_owner

        for participant in poll.event.participants.all():
            user = participant.user
            if _should_notify(user):
                recipients[user.pk] = user

        if not recipients:
            continue

        options_payload: list[dict[str, Any]] = []
        total_votes = 0

        for option in poll.options.all():
            votes_count = getattr(option, "votes_count", 0)
            total_votes += votes_count
            label = option.label
            if label is None and option.date_value is not None:
                label = option.date_value.strftime("%d.%m.%Y")
            options_payload.append(
                {
                    "label": label,
                    "date_value": option.date_value,
                    "votes": votes_count,
                },
            )

        context = {
            "poll": poll,
            "event": poll.event,
            "options": options_payload,
            "total_votes": total_votes,
            "is_final": poll.is_voting_closed(now=now),
            "end_at": poll.end_at,
        }

        for user in recipients.values():
            send_templated_email(
                to=[user.email],
                subject="Итоги голосования",
                template="email/poll_summary.html",
                context={
                    **context,
                    "user": user,
                },
            )
            emails_sent += 1

        poll.closing_notification_sent_at = now
        poll.closing_notification_for_end_at = poll.end_at
        polls_to_update.append(poll)

    if polls_to_update:
        Poll.objects.bulk_update(
            polls_to_update,
            ["closing_notification_sent_at", "closing_notification_for_end_at"],
        )

    return emails_sent


@shared_task
def send_daily_digest() -> int:
    """Заглушка под будущий ежедневный дайджест."""
    return 0
