from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Max, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.events.models import Event
from apps.tasks.models import Task, TaskList
from apps.tasks.permissions import IsEventOwnerWrite, IsEventParticipantReadOnly
from apps.tasks.serializers import BoardSerializer, TaskListSerializer, TaskSerializer


def _parse_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _get_tasklist_event_id(task_list_id: int | None) -> int | None:
    if task_list_id is None:
        return None
    return (
        TaskList.objects.filter(id=task_list_id)
        .values_list("event_id", flat=True)
        .first()
    )


def _get_task_event_id(task_id: int | None) -> int | None:
    if task_id is None:
        return None
    return (
        Task.objects.filter(id=task_id)
        .values_list("list__event_id", flat=True)
        .first()
    )


def _validate_ordered_ids(raw_value: Any) -> list[int]:
    """Проверяем, что пришел непустой список уникальных чисел."""
    if not isinstance(raw_value, list) or not raw_value:
        raise ValidationError({"ordered_ids": ["ordered_ids должен быть непустым списком чисел."]})

    try:
        ordered_ids = [int(item) for item in raw_value]
    except (TypeError, ValueError) as exc:
        raise ValidationError({"ordered_ids": ["ordered_ids должен содержать только целые числа."]}) from exc

    if len(ordered_ids) != len(set(ordered_ids)):
        raise ValidationError({"ordered_ids": ["ordered_ids не должен содержать дубликатов."]})

    return ordered_ids


class EventScopedPermissionMixin:
    """Выбирает набор прав доступа в зависимости от типа запроса."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated(), IsEventParticipantReadOnly()]
        return [IsAuthenticated(), IsEventOwnerWrite()]


class TaskListViewSet(EventScopedPermissionMixin, ModelViewSet):
    """CRUD для списков задач события."""

    serializer_class = TaskListSerializer
    queryset = TaskList.objects.all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[TaskList]:
        user = self.request.user
        queryset = (
            TaskList.objects.filter(event__participants__user=user)
            .select_related("event")
            .order_by("order", "id")
            .distinct()
        )
        event_id = _parse_int(self.request.query_params.get("event"))
        if event_id is not None:
            queryset = queryset.filter(event_id=event_id)
        return queryset

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id

        event_id = _parse_int(request.query_params.get("event"))
        if event_id is None and request.method not in SAFE_METHODS:
            event_id = _parse_int(request.data.get("event"))
        if event_id is None:
            pk = _parse_int(self.kwargs.get(self.lookup_field, None))
            event_id = _get_tasklist_event_id(pk)
        self._cached_event_id = event_id
        return event_id

    def perform_create(self, serializer: TaskListSerializer) -> None:
        event: Event = serializer.validated_data["event"]
        max_order = TaskList.objects.filter(event=event).aggregate(max_value=Max("order")).get("max_value")
        if max_order is None:
            max_order = -1
        serializer.save(order=max_order + 1)


class TaskViewSet(EventScopedPermissionMixin, ModelViewSet):
    """CRUD для задач внутри списков выбранного события."""

    serializer_class = TaskSerializer
    queryset = Task.objects.all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filterset_fields = ("status", "assignee", "list")
    search_fields = ("title", "description")
    ordering_fields = ("due_at", "created_at", "order")

    def get_queryset(self) -> QuerySet[Task]:
        user = self.request.user
        queryset = (
            Task.objects.filter(list__event__participants__user=user)
            .select_related("list", "list__event", "assignee")
            .prefetch_related("depends_on")
            .order_by("order", "id")
            .distinct()
        )

        list_id = _parse_int(self.request.query_params.get("list"))
        if list_id is not None:
            queryset = queryset.filter(list_id=list_id)

        event_id = _parse_int(self.request.query_params.get("event"))
        if event_id is not None:
            queryset = queryset.filter(list__event_id=event_id)
        return queryset

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id

        list_id = _parse_int(request.query_params.get("list"))
        if list_id is None and request.method not in SAFE_METHODS:
            list_id = _parse_int(request.data.get("list"))
        event_id = _get_tasklist_event_id(list_id)

        if event_id is None:
            event_id = _parse_int(request.query_params.get("event"))

        if event_id is None:
            pk = _parse_int(self.kwargs.get(self.lookup_field, None))
            event_id = _get_task_event_id(pk)

        self._cached_event_id = event_id
        return event_id

    def perform_create(self, serializer: TaskSerializer) -> None:
        task_list: TaskList = serializer.validated_data["list"]
        max_order = Task.objects.filter(list=task_list).aggregate(max_value=Max("order")).get("max_value")
        if max_order is None:
            max_order = -1
        serializer.save(order=max_order + 1)


class ReorderTaskListsView(APIView):
    permission_classes = [IsAuthenticated, IsEventOwnerWrite]

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id
        event_id = _parse_int(self.kwargs.get("event_id"))
        self._cached_event_id = event_id
        return event_id

    @transaction.atomic
    def post(self, request: Request, event_id: int) -> Response:
        ordered_ids = _validate_ordered_ids(request.data.get("ordered_ids"))
        event = get_object_or_404(Event.objects.only("id"), id=event_id)

        task_lists = list(
            TaskList.objects.filter(event=event)
            .select_for_update()
            .order_by("order", "id")
        )
        existing_ids = [task_list.id for task_list in task_lists]
        if set(existing_ids) != set(ordered_ids) or len(existing_ids) != len(ordered_ids):
            return Response(
                {
                    "code": "invalid_ids",
                    "message": "Переданы ID колонок, не принадлежащие событию либо отсутствующие.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        id_to_task_list = {task_list.id: task_list for task_list in task_lists}
        now = timezone.now()
        for index, task_list_id in enumerate(ordered_ids):
            task_list = id_to_task_list[task_list_id]
            task_list.order = index
            task_list.updated_at = now
            task_list.save(update_fields=["order", "updated_at"])

        return Response({"message": "ok", "count": len(ordered_ids)})


class ReorderTasksInListView(APIView):
    permission_classes = [IsAuthenticated, IsEventOwnerWrite]

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id
        list_id = _parse_int(self.kwargs.get("list_id"))
        event_id = _get_tasklist_event_id(list_id)
        self._cached_event_id = event_id
        return event_id

    @transaction.atomic
    def post(self, request: Request, list_id: int) -> Response:
        ordered_ids = _validate_ordered_ids(request.data.get("ordered_ids"))
        task_list = get_object_or_404(
            TaskList.objects.select_related("event").only("id", "event_id"),
            id=list_id,
        )

        tasks = list(
            Task.objects.filter(list=task_list)
            .select_for_update()
            .order_by("order", "id")
        )
        existing_ids = [task.id for task in tasks]
        if set(existing_ids) != set(ordered_ids) or len(existing_ids) != len(ordered_ids):
            return Response(
                {
                    "code": "invalid_ids",
                    "message": "Переданы ID задач, не принадлежащие указанной колонке.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        id_to_task = {task.id: task for task in tasks}
        now = timezone.now()
        for index, task_id in enumerate(ordered_ids):
            task = id_to_task[task_id]
            task.order = index
            task.updated_at = now
            task.save(update_fields=["order", "updated_at"])

        return Response({"message": "ok", "count": len(ordered_ids)})


class BoardView(EventScopedPermissionMixin, APIView):
    """Отдает структуру доски для конкретного события."""

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id
        event_id = _parse_int(self.kwargs.get("event_id"))
        self._cached_event_id = event_id
        return event_id

    def get(self, request: Request, event_id: int) -> Response:
        event = get_object_or_404(
            Event.objects.filter(participants__user=request.user).distinct(),
            id=event_id,
        )
        lists = (
            TaskList.objects.filter(event=event)
            .order_by("order", "id")
            .prefetch_related(
                Prefetch(
                    "tasks",
                    queryset=Task.objects.select_related("assignee", "list")
                    .prefetch_related("depends_on")
                    .order_by("order", "id"),
                ),
            )
        )
        serializer = BoardSerializer({"event": event, "lists": lists}, context={"request": request})
        return Response(serializer.data)
