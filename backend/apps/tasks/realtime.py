from __future__ import annotations

from typing import Any

from apps.tasks.models import Task, TaskList
from apps.tasks.serializers import TaskListSerializer, TaskSerializer


def task_to_payload(task: Task) -> dict[str, Any]:
    """Serialize a task instance into a JSON-ready payload."""

    return dict(TaskSerializer(task).data)


def task_list_to_payload(task_list: TaskList) -> dict[str, Any]:
    """Serialize a task list instance into a JSON-ready payload."""

    return dict(TaskListSerializer(task_list).data)


def task_deleted_payload(task_id: int, list_id: int) -> dict[str, Any]:
    """Payload for task deletion events."""

    return {"id": task_id, "list": list_id}


def task_list_deleted_payload(task_list_id: int, event_id: int) -> dict[str, Any]:
    """Payload for task list deletion events."""

    return {"id": task_list_id, "event": event_id}


def task_order_payload(list_id: int, ordered_ids: list[int]) -> dict[str, Any]:
    """Payload representing the new order of tasks within a list."""

    return {"list": list_id, "ordered_ids": ordered_ids}


def task_list_order_payload(event_id: int, ordered_ids: list[int]) -> dict[str, Any]:
    """Payload representing the new order of task lists within an event."""

    return {"event": event_id, "ordered_ids": ordered_ids}


def fetch_ordered_tasklist_ids(event_id: int) -> list[int]:
    """Helper that returns ordered task list ids for the given event."""

    return list(
        TaskList.objects.filter(event_id=event_id)
        .order_by("order", "id")
        .values_list("id", flat=True)
    )


def fetch_ordered_task_ids(list_id: int) -> list[int]:
    """Helper that returns ordered task ids for the given task list."""

    return list(
        Task.objects.filter(list_id=list_id)
        .order_by("order", "id")
        .values_list("id", flat=True)
    )
