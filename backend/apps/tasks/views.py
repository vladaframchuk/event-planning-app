from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Max, Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList
from apps.tasks.permissions import (
    IsEventOwner,
    IsEventOwnerWrite,
    IsEventParticipantReadOnly,
    IsTaskAssignee,
)
from apps.tasks.serializers import (
    BoardSerializer,
    TaskAssignSerializer,
    TaskListSerializer,
    TaskSerializer,
    TaskStatusSerializer,
)
from apps.tasks.realtime import (
    fetch_ordered_task_ids,
    fetch_ordered_tasklist_ids,
    task_deleted_payload,
    task_list_deleted_payload,
    task_list_order_payload,
    task_list_to_payload,
    task_order_payload,
    task_to_payload,
)
from apps.tasks.services.order import normalize_task_orders_in_list, normalize_tasklist_orders_in_event
from apps.tasks.services.progress import (
    compute_event_progress,
    get_cached_progress,
    invalidate_cached_progress,
    set_cached_progress,
)
from apps.tasks.ws_notify import notify_event_group_sync, notify_progress_invalidation


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
    """Validate that ordered_ids is a list of unique integers."""
    if not isinstance(raw_value, list):
        raise ValidationError({"ordered_ids": ["ordered_ids must be provided as a list of integers."]})
    if not raw_value:
        return []

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

    def get_permissions(self):
        if getattr(self, "action", None) == "destroy":
            return [IsAuthenticated()]
        return super().get_permissions()

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
        task_list_instance = serializer.save(order=max_order + 1)
        event_id = int(task_list_instance.event_id)
        notify_event_group_sync(
            event_id,
            "tasklist.created",
            task_list_to_payload(task_list_instance),
        )
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

    @transaction.atomic
    def destroy(self, request: Request, *args, **kwargs) -> Response:
        task_list = self.get_object()
        event = task_list.event
        if event.owner_id != request.user.id:
            # Проверяем, что удаление выполняет владелец события.
            return Response(status=status.HTTP_403_FORBIDDEN)
        event_id = int(task_list.event_id)
        response = super().destroy(request, *args, **kwargs)
        if response.status_code == status.HTTP_204_NO_CONTENT:
            normalize_tasklist_orders_in_event(event_id)
            notify_event_group_sync(
                event_id,
                "tasklist.deleted",
                task_list_deleted_payload(task_list.id, event_id),
            )
            ordered_ids = fetch_ordered_tasklist_ids(event_id)
            notify_event_group_sync(
                event_id,
                "tasklist.reordered",
                task_list_order_payload(event_id, ordered_ids),
            )
            notify_progress_invalidation(event_id)
            invalidate_cached_progress(event_id)
        return response


class TaskViewSet(EventScopedPermissionMixin, ModelViewSet):
    """CRUD для задач внутри списков выбранного события."""

    serializer_class = TaskSerializer
    queryset = Task.objects.all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filterset_fields = ("status", "assignee", "list")
    search_fields = ("title", "description")
    ordering_fields = ("due_at", "created_at", "order")

    def get_permissions(self):
        if getattr(self, "action", None) in {"take", "assign", "status", "destroy"}:
            return [IsAuthenticated()]
        return super().get_permissions()

    def _get_participant(self, task: Task, user) -> Participant | None:
        return (
            Participant.objects.select_related("user")
            .filter(event_id=task.list.event_id, user=user)
            .first()
        )

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

    @action(detail=True, methods=["post"])
    def take(self, request: Request, pk: int | None = None) -> Response:
        task = self.get_object()
        participant = self._get_participant(task, request.user)
        if participant is None:
            return Response(
                {"detail": "User is not a participant of this event."},
                status=status.HTTP_403_FORBIDDEN,
            )

        updated = (
            Task.objects.filter(id=task.id, assignee__isnull=True)
            .update(assignee=participant, updated_at=timezone.now())
        )
        if updated == 0:
            return Response({"code": "already_assigned"}, status=status.HTTP_409_CONFLICT)

        task.refresh_from_db()
        payload = task_to_payload(task)
        event_id = int(task.list.event_id)
        notify_event_group_sync(event_id, "task.updated", payload)
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

        return Response(
            {
                "message": "taken",
                "assignee": {
                    "id": participant.id,
                    "user": {
                        "id": participant.user.id,
                        "email": participant.user.email,
                        "name": participant.user.name,
                    },
                },
            }
        )

    @action(detail=True, methods=["post"])
    def assign(self, request: Request, pk: int | None = None) -> Response:
        task = self.get_object()
        if not IsEventOwner().has_object_permission(request, self, task):
            return Response(
                {"detail": "Only event owner can assign tasks."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TaskAssignSerializer(data=request.data, context={"task": task})
        serializer.is_valid(raise_exception=True)
        participant: Participant | None = serializer.validated_data["participant"]

        Task.objects.filter(id=task.id).update(
            assignee=participant, updated_at=timezone.now()
        )

        task.refresh_from_db()
        payload = task_to_payload(task)
        event_id = int(task.list.event_id)
        notify_event_group_sync(event_id, "task.updated", payload)
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

        return Response({"message": "assigned"})

    @action(detail=True, methods=["post"])
    def status(self, request: Request, pk: int | None = None) -> Response:
        task = self.get_object()
        owner_permission = IsEventOwner()
        assignee_permission = IsTaskAssignee()
        if not (
            owner_permission.has_object_permission(request, self, task)
            or assignee_permission.has_object_permission(request, self, task)
        ):
            return Response(
                {"code": "forbidden", "message": "Недостаточно прав"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TaskStatusSerializer(data=request.data, context={"task": task})
        serializer.is_valid(raise_exception=True)
        new_status: str = serializer.validated_data["status"]

        if new_status != task.status:
            Task.objects.filter(id=task.id).update(
                status=new_status,
                updated_at=timezone.now(),
            )
            task.refresh_from_db()
            payload = task_to_payload(task)
            event_id = int(task.list.event_id)
            notify_event_group_sync(event_id, "task.updated", payload)
            notify_progress_invalidation(event_id)
            invalidate_cached_progress(event_id)

        return Response({"message": "status_updated", "status": new_status})

    def perform_create(self, serializer: TaskSerializer) -> None:
        task_list: TaskList = serializer.validated_data["list"]
        max_order = Task.objects.filter(list=task_list).aggregate(max_value=Max("order")).get("max_value")
        if max_order is None:
            max_order = -1
        task = serializer.save(order=max_order + 1)
        payload = task_to_payload(task)
        event_id = int(task.list.event_id)
        notify_event_group_sync(event_id, "task.created", payload)
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

    def perform_update(self, serializer: TaskSerializer) -> None:
        task = serializer.save()
        payload = task_to_payload(task)
        event_id = int(task.list.event_id)
        notify_event_group_sync(event_id, "task.updated", payload)
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

    @transaction.atomic
    def destroy(self, request: Request, *args, **kwargs) -> Response:
        task = self.get_object()
        event_owner_id = task.list.event.owner_id
        if event_owner_id != request.user.id:
            # Предотвращаем удаление задач участниками без прав владельца.
            return Response(status=status.HTTP_403_FORBIDDEN)
        list_id = int(task.list_id)
        event_id = int(task.list.event_id)
        response = super().destroy(request, *args, **kwargs)
        if response.status_code == status.HTTP_204_NO_CONTENT:
            normalize_task_orders_in_list(list_id)
            notify_event_group_sync(
                event_id,
                "task.deleted",
                task_deleted_payload(task.id, list_id),
            )
            notify_progress_invalidation(event_id)
            invalidate_cached_progress(event_id)
        return response


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

        notify_event_group_sync(
            event_id,
            "tasklist.reordered",
            task_list_order_payload(event_id, ordered_ids),
        )
        notify_progress_invalidation(event_id)
        invalidate_cached_progress(event_id)

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

        notify_event_group_sync(
            task_list.event_id,
            "task.reordered",
            task_order_payload(task_list.id, ordered_ids),
        )
        notify_progress_invalidation(task_list.event_id)
        invalidate_cached_progress(task_list.event_id)

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
        participants = list(
            event.participants.select_related("user").order_by("id")
        )
        serializer = BoardSerializer(
            {"event": event, "lists": lists, "participants": participants},
            context={"request": request},
        )
        return Response(serializer.data)


class EventProgressView(APIView):
    """Возвращает агрегированные метрики выполнения задач события."""

    permission_classes = [IsAuthenticated]

    def get_event_id(self, request: Request) -> int | None:
        if hasattr(self, "_cached_event_id"):
            return self._cached_event_id
        event_id = _parse_int(self.kwargs.get("event_id"))
        self._cached_event_id = event_id
        return event_id

    def get(self, request: Request, event_id: int) -> Response:
        event = get_object_or_404(Event.objects.only("id", "owner_id"), id=event_id)
        if event.owner_id != request.user.id:
            is_participant = Participant.objects.filter(event=event, user=request.user).exists()
            if not is_participant:
                return Response(status=status.HTTP_403_FORBIDDEN)

        cached_payload = get_cached_progress(event_id)
        if cached_payload is not None:
            return Response(cached_payload)

        payload = compute_event_progress(event_id)
        set_cached_progress(event_id, payload)
        return Response(payload)







