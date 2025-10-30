from __future__ import annotations

from datetime import timezone as dt_timezone
from typing import Any

from django.db.models import Count, QuerySet
from django.db.models import Q
from django.utils import timezone

from apps.tasks.cache_utils import cache_safe_get, cache_safe_set
from apps.tasks.models import Task, TaskList

# Настройки кеша прогресса.
CACHE_KEY_TEMPLATE = "event:{event_id}:progress:v1"
CACHE_TTL_SECONDS = 30


def build_event_progress_cache_key(event_id: int) -> str:
    """Формирует ключ кеша со статической версией."""
    return CACHE_KEY_TEMPLATE.format(event_id=event_id)


def _annotated_lists(event_id: int) -> QuerySet[dict[str, Any]]:
    """Подготавливает запрос со сводными данными по спискам задач."""
    return (
        TaskList.objects.filter(event_id=event_id)
        .order_by("order", "id")
        .values("id", "title")
        .annotate(
            total=Count("tasks"),
            todo=Count("tasks", filter=Q(tasks__status=Task.Status.TODO)),
            doing=Count("tasks", filter=Q(tasks__status=Task.Status.DOING)),
            done=Count("tasks", filter=Q(tasks__status=Task.Status.DONE)),
        )
    )


def compute_event_progress(event_id: int) -> dict[str, Any]:
    """Возвращает агрегаты прогресса события с распределением по спискам."""
    counts = {"todo": 0, "doing": 0, "done": 0}
    total_tasks = 0
    by_list: list[dict[str, Any]] = []

    for item in _annotated_lists(event_id):
        entry = {
            "list_id": item["id"],
            "title": item["title"],
            "total": int(item["total"]),
            "todo": int(item["todo"]),
            "doing": int(item["doing"]),
            "done": int(item["done"]),
        }
        by_list.append(entry)
        total_tasks += entry["total"]
        counts["todo"] += entry["todo"]
        counts["doing"] += entry["doing"]
        counts["done"] += entry["done"]

    done_count = counts["done"]
    percent_done = 0.0 if total_tasks == 0 else round(done_count / total_tasks * 100, 1)
    generated_at = timezone.now().astimezone(dt_timezone.utc)

    return {
        "event_id": event_id,
        "total_tasks": total_tasks,
        "counts": counts,
        "percent_done": percent_done,
        "by_list": by_list,
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "ttl_seconds": CACHE_TTL_SECONDS,
    }


def get_cached_progress(event_id: int) -> dict[str, Any] | None:
    """Возвращает прогресс из кеша, если Redis доступен."""
    cached = cache_safe_get(build_event_progress_cache_key(event_id))
    if isinstance(cached, dict):
        return cached
    return None


def set_cached_progress(event_id: int, payload: dict[str, Any]) -> None:
    """Сохраняет прогресс в кеш, игнорируя проблемы подключения."""
    cache_safe_set(
        build_event_progress_cache_key(event_id),
        payload,
        timeout=CACHE_TTL_SECONDS,
    )
