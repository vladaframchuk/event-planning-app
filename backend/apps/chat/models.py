from __future__ import annotations

from django.conf import settings
from django.db import models


class Message(models.Model):
    """Сообщение в рамках события."""

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="messages",
        db_index=True,
        verbose_name="Событие",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="messages",
        db_index=True,
        verbose_name="Автор",
    )
    text = models.TextField(verbose_name="Текст")
    created_at = models.DateTimeField(
        auto_now_add=True, db_index=True, verbose_name="Создано"
    )
    edited_at = models.DateTimeField(null=True, blank=True, verbose_name="Изменено")

    class Meta:
        indexes = [
            models.Index(fields=["event", "created_at"]),
        ]
        ordering = ["created_at", "id"]
        verbose_name = "Сообщение"
        verbose_name_plural = "Сообщения"

    def __str__(self) -> str:
        """Короткое представление сообщения для админки."""
        preview = (self.text or "")[:30]
        return f"[{self.created_at}] {self.author_id}: {preview}"
