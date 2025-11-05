from __future__ import annotations

import secrets
from datetime import datetime
from typing import TYPE_CHECKING, Literal

from django.conf import settings
from django.db import models
from django.utils import timezone


class Event(models.Model):
    """Модель события с временными рамками и владельцем."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="events",
        verbose_name="Владелец",
    )
    title = models.CharField("Название", max_length=16)
    category = models.CharField("Категория", max_length=50, blank=True)
    description = models.TextField("Описание", blank=True)
    start_at = models.DateTimeField("Старт", null=True, blank=True)
    end_at = models.DateTimeField("Финиш", null=True, blank=True)
    location = models.CharField("Локация", max_length=200, blank=True)
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        verbose_name = "Событие"
        verbose_name_plural = "События"
        indexes = [
            models.Index(fields=["owner", "start_at"], name="idx_event_owner_start"),
            models.Index(fields=["start_at"], name="idx_event_start"),
        ]
        ordering = ("-start_at", "id")

    def __str__(self) -> str:
        """Возвращает читаемое имя события."""
        return self.title


class Participant(models.Model):
    """Участник события с фиксированными ролями."""

    RoleLiteral = Literal["organizer", "member"]

    class Role(models.TextChoices):
        ORGANIZER = "organizer", "Организатор"
        MEMBER = "member", "Участник"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="participations",
        verbose_name="Пользователь",
    )
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="participants",
        verbose_name="Событие",
    )
    role = models.CharField(
        "Роль",
        max_length=16,
        choices=Role.choices,
        default=Role.MEMBER,
        db_index=True,
    )
    joined_at = models.DateTimeField("Дата присоединения", auto_now_add=True)

    if TYPE_CHECKING:
        role: RoleLiteral

    class Meta:
        verbose_name = "Участник"
        verbose_name_plural = "Участники"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "event"],
                name="uq_participant_user_event",
            ),
        ]
        indexes = [
            models.Index(fields=["event"], name="idx_participant_event"),
            models.Index(fields=["user", "event"], name="idx_participant_user_event"),
        ]

    def __str__(self) -> str:
        """Возвращает представление участника для админки."""
        return f"{self.user} @ {self.event}"


def _generate_invite_token() -> str:
    """Криптостойкая генерация токена приглашения."""
    return secrets.token_urlsafe(32)


class Invite(models.Model):
    """Инвайт для присоединения к событию."""

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="invites",
        verbose_name="Событие",
    )
    token = models.CharField(
        "Токен",
        max_length=128,
        unique=True,
        default=_generate_invite_token,
        help_text="Уникальный токен приглашения.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_invites",
        verbose_name="Создатель",
    )
    expires_at = models.DateTimeField("Истекает в")
    max_uses = models.PositiveIntegerField("Максимум использований", default=0)
    uses_count = models.PositiveIntegerField("Количество использований", default=0)
    is_revoked = models.BooleanField("Отозвано", default=False)
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлено", auto_now=True)

    class Meta:
        verbose_name = "Инвайт"
        verbose_name_plural = "Инвайты"
        indexes = [
            models.Index(
                fields=["event", "expires_at", "is_revoked"],
                name="inv_event_exp_rev_idx",
            ),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        """Короткое представление инвайта."""
        return f"Invite for event {self.event_id}"

    def is_active(self, now: datetime | None = None) -> bool:
        """Инвайт активен, если не отозван, не просрочен и не исчерпан."""
        current_time = now or timezone.now()
        if self.is_revoked:
            return False
        if self.expires_at <= current_time:
            return False
        if self.max_uses != 0 and self.uses_count >= self.max_uses:
            return False
        return True
