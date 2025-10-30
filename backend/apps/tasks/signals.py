from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.tasks.cache_utils import cache_safe_delete
from apps.tasks.models import Task, TaskList
from apps.tasks.services.progress import build_event_progress_cache_key


def _resolve_event_id(instance: Any) -> int | None:
    """Извлекает идентификатор события из задач и списков."""
    if isinstance(instance, TaskList):
        if instance.event_id is not None:
            return int(instance.event_id)
        event = getattr(instance, "event", None)
        return getattr(event, "id", None)
    if isinstance(instance, Task):
        if hasattr(instance, "list") and isinstance(instance.list, TaskList):
            return instance.list.event_id
        if instance.list_id is not None:
            return (
                TaskList.objects.filter(id=instance.list_id)
                .values_list("event_id", flat=True)
                .first()
            )
    return None


def _invalidate_progress_cache(event_id: int | None) -> None:
    """Удаляет агрегаты прогресса по событию из кеша."""
    if event_id is None:
        return
    cache_safe_delete(build_event_progress_cache_key(int(event_id)))


@receiver(post_save, sender=Task)
def on_task_saved(sender, instance: Task, **kwargs) -> None:
    """Инвалидирует прогресс при изменении задачи."""
    _invalidate_progress_cache(_resolve_event_id(instance))


@receiver(post_delete, sender=Task)
def on_task_deleted(sender, instance: Task, **kwargs) -> None:
    """Инвалидирует прогресс при удалении задачи."""
    _invalidate_progress_cache(_resolve_event_id(instance))


@receiver(post_save, sender=TaskList)
def on_task_list_saved(sender, instance: TaskList, **kwargs) -> None:
    """Инвалидирует прогресс при изменении списка."""
    _invalidate_progress_cache(_resolve_event_id(instance))


@receiver(post_delete, sender=TaskList)
def on_task_list_deleted(sender, instance: TaskList, **kwargs) -> None:
    """Инвалидирует прогресс при удалении списка."""
    _invalidate_progress_cache(_resolve_event_id(instance))
