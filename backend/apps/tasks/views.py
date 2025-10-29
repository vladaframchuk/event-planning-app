from __future__ import annotations

from typing import Any

from django.db.models import Max, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
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
