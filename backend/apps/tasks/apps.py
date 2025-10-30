from __future__ import annotations

from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tasks"
    verbose_name = "РљР°РЅР±Р°РЅ Р·Р°РґР°С‡Рё"

    def ready(self) -> None:
        """Подключает сигналы приложения задач."""
        from . import signals  # noqa: F401
