from __future__ import annotations

from datetime import datetime

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.events.models import Event


class Poll(models.Model):
    """Опрос внутри события."""

    class Type(models.TextChoices):
        DATE = "date", "date"
        PLACE = "place", "place"
        CUSTOM = "custom", "custom"

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="polls",
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_polls",
    )
    type = models.CharField(max_length=10, choices=Type.choices)
    question = models.CharField(max_length=200)
    multiple = models.BooleanField(default=False)
    allow_change_vote = models.BooleanField(default=True)
    is_closed = models.BooleanField(default=False)
    end_at = models.DateTimeField(null=True, blank=True)
    closing_notification_sent_at = models.DateTimeField(null=True, blank=True)
    closing_notification_for_end_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["event", "is_closed"], name="idx_poll_event_closed"),
            models.Index(fields=["end_at"], name="idx_poll_end_at"),
            models.Index(
                fields=["closing_notification_sent_at"],
                name="idx_poll_closing_notified",
            ),
        ]
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"Poll<{self.id}>"

    def is_expired(self, now: datetime | None = None) -> bool:
        current_time = now or timezone.now()
        return self.end_at is not None and self.end_at <= current_time

    def is_voting_closed(self, now: datetime | None = None) -> bool:
        return self.is_closed or self.is_expired(now=now)


class PollOption(models.Model):
    """Вариант ответа в опросе."""

    id = models.BigAutoField(primary_key=True)
    poll = models.ForeignKey(
        Poll,
        on_delete=models.CASCADE,
        related_name="options",
    )
    label = models.CharField(max_length=200, null=True, blank=True)
    date_value = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["poll", "date_value"],
                condition=Q(date_value__isnull=False),
                name="uq_polloption_poll_date",
            ),
            models.UniqueConstraint(
                fields=["poll", "label"],
                condition=Q(label__isnull=False) & ~Q(label=""),
                name="uq_polloption_poll_label",
            ),
        ]
        indexes = [
            models.Index(fields=["poll"], name="idx_polloption_poll"),
        ]
        ordering = ("id",)

    def __str__(self) -> str:
        return f"Option<{self.id}>"


class Vote(models.Model):
    """Голос пользователя за конкретный вариант опроса."""

    id = models.BigAutoField(primary_key=True)
    poll = models.ForeignKey(
        Poll,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    option = models.ForeignKey(
        PollOption,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="poll_votes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["poll", "user", "option"],
                name="uq_vote_poll_user_option",
            ),
        ]
        indexes = [
            models.Index(fields=["poll"], name="idx_vote_poll"),
            models.Index(fields=["option"], name="idx_vote_option"),
            models.Index(fields=["user"], name="idx_vote_user"),
        ]
        ordering = ("-created_at", "id")

    def __str__(self) -> str:
        return f"Vote<{self.id}>"
