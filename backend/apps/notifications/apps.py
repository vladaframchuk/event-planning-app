from __future__ import annotations

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """Конфигурация приложения уведомлений."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Уведомления"
