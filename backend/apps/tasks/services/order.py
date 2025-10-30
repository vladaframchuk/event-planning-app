from __future__ import annotations

from django.db import transaction

from apps.tasks.models import Task, TaskList


@transaction.atomic
def normalize_task_orders_in_list(list_id: int) -> None:
    """Пересчитываем порядковые индексы задач после удаления элемента."""
    tasks = list(
        Task.objects.filter(list_id=list_id)
        .select_for_update()
        .order_by("order", "id")
        .only("id", "order")
    )
    needs_update: list[Task] = []
    for index, task in enumerate(tasks):
        if task.order != index:
            task.order = index
            needs_update.append(task)
    if needs_update:
        Task.objects.bulk_update(needs_update, ["order"])


@transaction.atomic
def normalize_tasklist_orders_in_event(event_id: int) -> None:
    """Приводим порядок колонок события к непрерывной последовательности."""
    task_lists = list(
        TaskList.objects.filter(event_id=event_id)
        .select_for_update()
        .order_by("order", "id")
        .only("id", "order")
    )
    needs_update: list[TaskList] = []
    for index, task_list in enumerate(task_lists):
        if task_list.order != index:
            task_list.order = index
            needs_update.append(task_list)
    if needs_update:
        TaskList.objects.bulk_update(needs_update, ["order"])
