from __future__ import annotations

from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tasks"
    verbose_name = "Канбан задачи"

    def ready(self) -> None:
        from . import signals  # noqa: F401
