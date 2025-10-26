from __future__ import annotations

from django.conf import settings
from django.db import models


class Event(models.Model):
    """Модель события с временными рамками и владельцем."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="events",
        verbose_name="Владелец",
    )
    title = models.CharField("Название", max_length=200)
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
    )
    joined_at = models.DateTimeField("Дата присоединения", auto_now_add=True)

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
